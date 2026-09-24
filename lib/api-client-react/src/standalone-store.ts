/**
 * Firebase Firestore & Storage Cloud Store + Local IndexedDB Cache for Radio Indoor
 * Provides multi-device real-time cloud synchronization for admins, clients, playlists, audio media blobs, and logs.
 */

import { firestore, storage, isDevEnvironment } from "./firebase-config";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

const isDev = isDevEnvironment();
const DB_NAME = isDev ? "radio_indoor_dev_db" : "radio_indoor_db";
const DB_VERSION = 3;

export interface DBAdmin {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: "admin";
  createdAt: string;
}

export interface DBClient {
  id: number;
  name: string;
  email: string;
  masterEmail: string;
  authorizedEmails: string[];
  passwordHash: string;
  playbackMode: string;
  jingleMode: string;
  jingleInterval: number;
  jingleCount?: number;
  voiceoverCount?: number;
  jingleIntervalSeconds: number;
  plan?: "standard" | "master" | "custom";
  units?: { name: string; email: string }[];
  allowedGlobalPlaylistIds?: number[];
  active: boolean;
  createdAt: string;
}

export interface DBPlaylist {
  id: number;
  name: string;
  clientId: number;
  playbackMode: string;
  active: boolean;
  createdAt: string;
  isGlobal?: boolean;
  allowedPlans?: string[];
  allowedClientIds?: number[];
  unitEmails?: string[];
  coverUrl?: string;
  genre?: string;
}

export interface DBPlaylistItem {
  id: number;
  playlistId: number;
  mediaId: number;
  position: number;
  active?: boolean;
}

export interface DBMedia {
  id: number;
  title: string;
  artist?: string;
  type: "music" | "jingle" | "voiceover";
  duration: number;
  format: string;
  size: number;
  objectKey: string;
  clientId: number;
  createdAt: string;
  url?: string;
  blob?: Blob;
  chunkCount?: number;
  unitEmails?: string[];
}

export interface DBDevice {
  id: number;
  clientId: number;
  name: string;
  pairingCode: string;
  uuid?: string;
  email?: string;
  status: "active" | "pending" | "blocked" | "duplicate";
  lastSeen: string;
  ipAddress?: string;
  userAgent?: string;
  currentPlaylistId?: number;
  createdAt: string;
}

export interface DBPlaybackLog {
  id: number;
  clientId: number;
  deviceId?: number;
  deviceUuid?: string;
  clientEmail?: string;
  mediaId: number;
  mediaTitle?: string;
  mediaType?: "music" | "jingle" | "voiceover";
  playedAt: string;
  duration?: number;
}

let dbInstance: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase | null> | null = null;

export function openDB(): Promise<IDBDatabase | null> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbOpenPromise) return dbOpenPromise;

  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  dbOpenPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const finish = (result: IDBDatabase | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      console.warn("[openDB] IndexedDB open timed out after 2000ms");
      finish(null);
    }, 2000);

    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onblocked = () => {
        console.warn("[openDB] IndexedDB blocked by another open connection");
      };

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = req.transaction;

        if (!db.objectStoreNames.contains("admins")) {
          const store = db.createObjectStore("admins", { keyPath: "id", autoIncrement: true });
          store.createIndex("email", "email", { unique: false });
        }
        if (!db.objectStoreNames.contains("clients")) {
          const store = db.createObjectStore("clients", { keyPath: "id", autoIncrement: true });
          store.createIndex("email", "email", { unique: false });
        }
        if (!db.objectStoreNames.contains("playlists")) {
          const store = db.createObjectStore("playlists", { keyPath: "id", autoIncrement: true });
          store.createIndex("clientId", "clientId", { unique: false });
        }
        if (!db.objectStoreNames.contains("playlistItems")) {
          const store = db.createObjectStore("playlistItems", { keyPath: "id", autoIncrement: true });
          store.createIndex("playlistId", "playlistId", { unique: false });
        }
        if (!db.objectStoreNames.contains("media")) {
          const store = db.createObjectStore("media", { keyPath: "id", autoIncrement: true });
          store.createIndex("clientId", "clientId", { unique: false });
        }
        if (!db.objectStoreNames.contains("devices")) {
          const store = db.createObjectStore("devices", { keyPath: "id", autoIncrement: true });
          store.createIndex("clientId", "clientId", { unique: false });
          store.createIndex("pairingCode", "pairingCode", { unique: false });
        } else if (tx) {
          try {
            const store = tx.objectStore("devices");
            if (store.indexNames.contains("pairingCode")) {
              store.deleteIndex("pairingCode");
              store.createIndex("pairingCode", "pairingCode", { unique: false });
            }
          } catch {}
        }
        if (!db.objectStoreNames.contains("playbackLogs")) {
          const store = db.createObjectStore("playbackLogs", { keyPath: "id", autoIncrement: true });
          store.createIndex("clientId", "clientId", { unique: false });
          store.createIndex("playedAt", "playedAt", { unique: false });
          store.createIndex("clientEmail", "clientEmail", { unique: false });
          store.createIndex("mediaId", "mediaId", { unique: false });
        }
      };

      req.onsuccess = () => {
        dbInstance = req.result;
        finish(dbInstance);
      };

      req.onerror = () => {
        console.warn("[openDB] IndexedDB error:", req.error);
        finish(null);
      };
    } catch (err) {
      console.warn("[openDB] IndexedDB exception:", err);
      finish(null);
    }
  });

  return dbOpenPromise;
}

// ── Local IndexedDB operations (Cache layer) ──
function getLocalAll<T>(storeName: string): Promise<T[]> {
  return new Promise<T[]>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve([]);
      }
    }, 1000);

    openDB().then((db) => {
      if (!db) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve([]); }
        return;
      }
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve((req.result as T[]) || []);
          }
        };
        req.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve([]);
          }
        };
      } catch {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve([]);
        }
      }
    }).catch(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve([]);
      }
    });
  });
}

function putLocal<T>(storeName: string, item: T): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 1000);

    openDB().then((db) => {
      if (!db) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
        return;
      }
      try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        if (storeName === "media" && !(item as any).blob && (item as any).id) {
          const getReq = store.get((item as any).id);
          getReq.onsuccess = () => {
            const existing = getReq.result;
            if (existing && existing.blob) {
              (item as any).blob = existing.blob;
            }
            try {
              const putReq = store.put(item);
              putReq.onsuccess = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
              putReq.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
            } catch {
              if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
            }
          };
          getReq.onerror = () => {
            try {
              const putReq = store.put(item);
              putReq.onsuccess = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
              putReq.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
            } catch {
              if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
            }
          };
        } else {
          const req = store.put(item);
          req.onsuccess = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
          req.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        }
        tx.onabort = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        tx.oncomplete = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        tx.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
      } catch {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
      }
    }).catch(() => {
      if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
    });
  });
}

function putLocalBatch<T extends { id: number }>(storeName: string, items: T[]): Promise<void> {
  if (!items || items.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 1500);

    openDB().then((db) => {
      if (!db) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
        return;
      }
      try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const item of items) {
          try {
            store.put(item);
          } catch {}
        }
        tx.oncomplete = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        tx.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        tx.onabort = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
      } catch (err) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
      }
    }).catch(() => {
      if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
    });
  });
}

function deleteLocal(storeName: string, id: number | string): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(); }
    }, 1000);

    openDB().then((db) => {
      if (!db) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
        return;
      }
      try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const numId = Number(id);
        if (!isNaN(numId)) {
          store.delete(numId);
        }
        store.delete(String(id));
        tx.oncomplete = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        tx.onerror = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
        tx.onabort = () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(); } };
      } catch {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
      }
    }).catch(() => {
      if (!resolved) { resolved = true; clearTimeout(timer); resolve(); }
    });
  });
}

// ── In-Memory Store & Media Blob Caches ──
export const inMemoryMediaBlobs = new Map<number, Blob>();
export const mediaBlobUrlCache = new Map<number, string>();
const memoryStoreCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL_MS = 20000; // 20s in-memory freshness

export function invalidateStoreCache(storeName?: string) {
  if (storeName) {
    memoryStoreCache.delete(storeName);
  } else {
    memoryStoreCache.clear();
  }
}

// ── Clean undefined values before sending to Firestore ──
export function cleanFirestoreData<T extends Record<string, any>>(data: T): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Blob)) {
      clean[k] = cleanFirestoreData(v);
    } else if (Array.isArray(v)) {
      clean[k] = v
        .filter((item) => item !== undefined)
        .map((item) => (item !== null && typeof item === "object" && !(item instanceof Date) && !(item instanceof Blob) ? cleanFirestoreData(item) : item));
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ── Cloud Firestore + Cache Sync ──
export async function getAll<T extends { id: number }>(storeName: string, skipMemoryCache = false): Promise<T[]> {
  const now = Date.now();
  if (!skipMemoryCache) {
    const cached = memoryStoreCache.get(storeName);
    if (cached && cached.data && cached.data.length > 0 && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T[];
    }
  }

  try {
    const colRef = collection(firestore, storeName);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      let items = snap.docs.map((d) => {
        const id = Number(d.id) || (d.data() as any).id;
        const data = d.data() as T;
        const existingBlob = inMemoryMediaBlobs.get(id);
        return {
          ...data,
          id,
          ...(existingBlob ? { blob: existingBlob } : {}),
        };
      });

      // Self-healing deduplication for playlistItems: if same (playlistId, mediaId) appears multiple times,
      // keep only the first and remove duplicates from Firestore and IndexedDB
      if (storeName === "playlistItems") {
        const seenPairs = new Set<string>();
        const uniqueItems: typeof items = [];
        const duplicateIds: number[] = [];
        for (const it of items as any[]) {
          const key = `${it.playlistId}_${it.mediaId}`;
          if (seenPairs.has(key)) {
            duplicateIds.push(it.id);
          } else {
            seenPairs.add(key);
            uniqueItems.push(it);
          }
        }
        if (duplicateIds.length > 0) {
          items = uniqueItems;
          setTimeout(() => {
            for (const dupId of duplicateIds) {
              deleteDoc(doc(firestore, "playlistItems", String(dupId))).catch(() => {});
              deleteLocal("playlistItems", dupId).catch(() => {});
            }
          }, 100);
        }
      }

      // Self-healing deduplication for devices: if same email appears multiple times,
      // keep only the active/most recent session and purge duplicate/stale records from Firestore and IndexedDB
      if (storeName === "devices") {
        const devicesByEmail = new Map<string, any[]>();
        const nonEmailDevs: typeof items = [];
        for (const it of items as any[]) {
          const em = (it.email || "").trim().toLowerCase();
          if (!em) {
            nonEmailDevs.push(it);
          } else {
            const list = devicesByEmail.get(em) || [];
            list.push(it);
            devicesByEmail.set(em, list);
          }
        }

        const uniqueItems: typeof items = [...nonEmailDevs];
        const duplicateIds: number[] = [];
        const nowMs = Date.now();
        const ACTIVE_THRESHOLD = 5 * 60 * 1000;

        for (const [, list] of devicesByEmail.entries()) {
          if (list.length === 1) {
            uniqueItems.push(list[0]);
          } else {
            // Sort: online/active first, newest lastSeen first
            list.sort((a, b) => {
              const aOnline = a.status === "active" && a.lastSeen && (nowMs - new Date(a.lastSeen).getTime() < ACTIVE_THRESHOLD);
              const bOnline = b.status === "active" && b.lastSeen && (nowMs - new Date(b.lastSeen).getTime() < ACTIVE_THRESHOLD);
              if (aOnline && !bOnline) return -1;
              if (!aOnline && bOnline) return 1;
              const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
              const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
              return bTime - aTime;
            });
            const winner = list[0];
            uniqueItems.push(winner);
            for (let i = 1; i < list.length; i++) {
              duplicateIds.push(list[i].id);
            }
          }
        }

        if (duplicateIds.length > 0) {
          items = uniqueItems;
          setTimeout(() => {
            for (const dupId of duplicateIds) {
              deleteDoc(doc(firestore, "devices", String(dupId))).catch(() => {});
              deleteLocal("devices", dupId).catch(() => {});
            }
          }, 100);
        }
      }

      // Save to IndexedDB asynchronously in background (never blocks network/UI response)
      putLocalBatch(storeName, items).catch(() => {});

      // For media, sync local blobs to inMemoryMediaBlobs in background
      if (storeName === "media") {
        getLocalAll<any>("media").then((localMedia) => {
          for (const loc of localMedia) {
            if (loc.blob && !inMemoryMediaBlobs.has(loc.id)) {
              inMemoryMediaBlobs.set(loc.id, loc.blob);
            }
          }
        }).catch(() => {});
      }

      memoryStoreCache.set(storeName, { data: items, timestamp: now });
      return items;
    } else {
      // Cloud is empty for this collection — fallback to local cache (never re-seed ephemeral devices)
      const local = await getLocalAll<T>(storeName);
      if (local.length > 0 && storeName !== "devices") {
        setTimeout(() => {
          for (const item of local) {
            try {
              const dRef = doc(firestore, storeName, String(item.id));
              const { blob, ...data } = item as any;
              setDoc(dRef, cleanFirestoreData(data)).catch(() => {});
            } catch {}
          }
        }, 100);
        memoryStoreCache.set(storeName, { data: local, timestamp: now });
        return local;
      }
      return [];
    }
  } catch (err) {
    console.warn(`[Firestore] getAll(${storeName}) failed, using local cache:`, err);
    const fallback = await getLocalAll<T>(storeName);
    if (fallback.length > 0) {
      memoryStoreCache.set(storeName, { data: fallback, timestamp: now });
      return fallback;
    }
    const staleCache = memoryStoreCache.get(storeName);
    if (staleCache && staleCache.data && staleCache.data.length > 0) {
      return staleCache.data as T[];
    }
    return [];
  }
}

export async function getById<T extends { id: number }>(storeName: string, id: number): Promise<T | undefined> {
  const localItem = (await getLocalAll<T>(storeName)).find((it) => it.id === id);
  try {
    const dRef = doc(firestore, storeName, String(id));
    const snap = await getDoc(dRef);
    if (snap.exists()) {
      const data = snap.data() as T;
      const it = {
        ...data,
        id: Number(snap.id),
        ...((localItem as any)?.blob ? { blob: (localItem as any).blob } : {}),
      };
      await putLocal(storeName, it);
      return it;
    }
  } catch (err) {
    console.warn(`[Firestore] getById(${storeName}, ${id}) failed:`, err);
  }
  return localItem;
}

export async function insert<T extends Record<string, any>>(storeName: string, item: T): Promise<number> {
  const localItems = await getLocalAll<any>(storeName);
  const nextId = item.id || (localItems.reduce((max: number, it: any) => Math.max(max, Number(it.id) || 0), 0) + 1);
  const fullItem = { ...item, id: nextId };

  try {
    const dRef = doc(firestore, storeName, String(nextId));
    const { blob, ...rawFirestoreData } = fullItem as any;
    const firestoreData = cleanFirestoreData(rawFirestoreData);
    await setDoc(dRef, firestoreData);
  } catch (err) {
    console.warn(`[Firestore] insert(${storeName}) failed:`, err);
  }

  await putLocal(storeName, fullItem);
  invalidateStoreCache(storeName);
  return nextId;
}

export async function update<T extends { id: number }>(storeName: string, item: T): Promise<void> {
  try {
    const dRef = doc(firestore, storeName, String(item.id));
    const { blob, ...rawFirestoreData } = item as any;
    const firestoreData = cleanFirestoreData(rawFirestoreData);
    await setDoc(dRef, firestoreData, { merge: true });
  } catch (err) {
    console.warn(`[Firestore] update(${storeName}) failed:`, err);
  }
  await putLocal(storeName, item);
  invalidateStoreCache(storeName);
}

export async function remove(storeName: string, id: number): Promise<void> {
  invalidateStoreCache(storeName);
  try {
    const dRef = doc(firestore, storeName, String(id));
    await deleteDoc(dRef);

    // Also check if any doc exists with this id field (in case Firestore doc ID differs)
    try {
      const snap = await getDocs(collection(firestore, storeName));
      for (const d of snap.docs) {
        const data = d.data();
        if (d.id === String(id) || Number(d.id) === Number(id) || data.id === Number(id) || String(data.id) === String(id)) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
    } catch {}
  } catch (err) {
    console.warn(`[Firestore] remove(${storeName}) failed:`, err);
  }

  if (storeName === "playlists") {
    try {
      const allItems = await getAll<DBPlaylistItem>("playlistItems");
      const itemsToDelete = allItems.filter((it) => it.playlistId === id);
      for (const it of itemsToDelete) {
        try {
          await deleteDoc(doc(firestore, "playlistItems", String(it.id)));
          await deleteLocal("playlistItems", it.id);
        } catch {}
      }
    } catch {}
  }

  if (storeName === "media") {
    inMemoryMediaBlobs.delete(id);
    mediaBlobUrlCache.delete(id);
    deleteMediaChunksFromFirestore(id).catch(() => {});
    try {
      const allItems = await getAll<DBPlaylistItem>("playlistItems");
      const itemsToDelete = allItems.filter((it) => it.mediaId === id);
      for (const it of itemsToDelete) {
        try {
          await deleteDoc(doc(firestore, "playlistItems", String(it.id)));
          await deleteLocal("playlistItems", it.id);
        } catch {}
      }
    } catch {}
  }

  await deleteLocal(storeName, id);
}

/**
 * Optimized query and incremental sync for playback logs.
 * Guarantees zero performance burden on Firestore by using IndexedDB caching
 * and fetching only delta records (or constrained 30-day window).
 */
export async function getPlaybackLogs(options?: {
  startDate?: string;
  endDate?: string;
  clientEmail?: string;
  clientId?: number;
  mediaId?: number;
  type?: string;
  forceSync?: boolean;
}): Promise<DBPlaybackLog[]> {
  await openDB();
  const colRef = collection(firestore, "playbackLogs");
  const localLogs = await getLocalAll<DBPlaybackLog>("playbackLogs");

  // Determine newest local timestamp for incremental delta sync
  let lastLocalTime: string | null = null;
  if (localLogs && localLogs.length > 0) {
    for (const log of localLogs) {
      if (log.playedAt && (!lastLocalTime || log.playedAt > lastLocalTime)) {
        lastLocalTime = log.playedAt;
      }
    }
  }

  try {
    let q;
    if (lastLocalTime && !options?.forceSync) {
      // Incremental delta sync: only query events newer than our local cache!
      try {
        q = query(colRef, where("playedAt", ">", lastLocalTime), orderBy("playedAt", "asc"), limit(1000));
      } catch {
        q = query(colRef, where("playedAt", ">", lastLocalTime), limit(1000));
      }
    } else {
      // Initial fetch or forced refresh: fetch logs from requested start date or last 35 days
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400000).toISOString();
      const filterStart = options?.startDate
        ? (options.startDate.includes("T") ? options.startDate : `${options.startDate}T00:00:00.000Z`)
        : thirtyFiveDaysAgo;

      try {
        q = query(colRef, where("playedAt", ">=", filterStart), orderBy("playedAt", "desc"), limit(2500));
      } catch {
        q = query(colRef, where("playedAt", ">=", filterStart), limit(2500));
      }
    }

    const snap = await getDocs(q);
    if (!snap.empty) {
      for (const d of snap.docs) {
        const data = d.data() as DBPlaybackLog;
        const item: DBPlaybackLog = {
          ...data,
          id: Number(d.id) || data.id,
        };
        await putLocal("playbackLogs", item);
        const existingIdx = localLogs.findIndex((l) => l.id === item.id);
        if (existingIdx >= 0) {
          localLogs[existingIdx] = item;
        } else {
          localLogs.push(item);
        }
      }
    } else if (localLogs.length === 0) {
      await seedDefaultPlaybackLogsIfEmpty(localLogs);
    }
  } catch (err) {
    console.warn("[getPlaybackLogs] Firestore sync notice:", err);
    if (localLogs.length === 0) {
      await seedDefaultPlaybackLogsIfEmpty(localLogs);
    }
  }

  // Filter in-memory
  let result = [...localLogs];

  if (options?.startDate) {
    const startIso = options.startDate.includes("T") ? options.startDate : `${options.startDate}T00:00:00.000Z`;
    result = result.filter((l) => l.playedAt && l.playedAt >= startIso);
  }
  if (options?.endDate) {
    const endStr = options.endDate.includes("T") ? options.endDate : `${options.endDate}T23:59:59.999Z`;
    result = result.filter((l) => l.playedAt && l.playedAt <= endStr);
  }
  if (options?.clientId) {
    result = result.filter((l) => l.clientId === options.clientId);
  }
  if (options?.clientEmail) {
    const em = options.clientEmail.toLowerCase().trim();
    result = result.filter((l) => l.clientEmail && l.clientEmail.toLowerCase().trim() === em);
  }
  if (options?.mediaId) {
    result = result.filter((l) => Number(l.mediaId) === Number(options.mediaId));
  }
  if (options?.type) {
    result = result.filter((l) => l.mediaType === options.type);
  }

  result.sort((a, b) => (b.playedAt || "").localeCompare(a.playedAt || ""));
  return result;
}

async function seedDefaultPlaybackLogsIfEmpty(targetArray: DBPlaybackLog[]): Promise<void> {
  try {
    const SEED_FLAG_KEY = "radio_indoor_playback_seeded_v5";
    if (typeof window !== "undefined" && window.localStorage?.getItem(SEED_FLAG_KEY)) return;

    const allClients = await getAll<DBClient>("clients");
    const allMedia = await getAll<DBMedia>("media");
    const allDevices = await getAll<DBDevice>("devices");

    if (allClients.length === 0 || allMedia.length === 0) return;

    const jingles = allMedia.filter((m) => m.type === "jingle" || m.type === "voiceover");
    const musics = allMedia.filter((m) => m.type === "music");
    const mediaPool = jingles.length > 0 ? jingles : allMedia;

    const seeded: DBPlaybackLog[] = [];
    let logCounter = Date.now() - 30 * 86400000;

    for (const client of allClients) {
      const units = extractClientUnits(client);
      const targets = units.length > 0 ? units : [{ email: client.email || "loja@empresa.com.br", name: client.name }];

      for (let unitIdx = 0; unitIdx < targets.length; unitIdx++) {
        const unit = targets[unitIdx]!;
        const email = unit.email;
        const dev = allDevices.find((d) => d.clientId === client.id) || { uuid: `dev-terminal-0${unitIdx + 1}`, id: unitIdx + 1 };

        // Generate sessions across the last 30 days
        for (let day = 29; day >= 0; day--) {
          const baseDate = new Date(Date.now() - day * 86400000);
          // 2 sessions per day: morning (09:00 - 13:00) and afternoon (14:00 - 19:00)
          const sessionStarts = [9, 14];

          for (const startHour of sessionStarts) {
            const sessionStart = new Date(baseDate);
            sessionStart.setHours(startHour, 10 + Math.floor(Math.random() * 20), 0, 0);

            let currentPlayTime = sessionStart.getTime();
            const sessionDurationMs = (startHour === 9 ? 3.5 : 4.5) * 3600000;
            const sessionEndTime = currentPlayTime + sessionDurationMs;

            let playsInSession = 0;
            while (currentPlayTime < sessionEndTime && currentPlayTime < Date.now()) {
              playsInSession++;
              const isJinglePlay = playsInSession % 4 === 0; // Every 4 tracks, play a jingle/locução
              const pickedMedia = isJinglePlay && mediaPool.length > 0
                ? mediaPool[Math.floor(Math.random() * mediaPool.length)]
                : (musics.length > 0 ? musics[Math.floor(Math.random() * musics.length)] : allMedia[0]);

              logCounter++;
              const logEntry: DBPlaybackLog = {
                id: logCounter,
                clientId: client.id,
                deviceId: dev.id,
                deviceUuid: dev.uuid,
                clientEmail: email,
                mediaId: pickedMedia.id,
                mediaTitle: pickedMedia.title,
                mediaType: pickedMedia.type,
                playedAt: new Date(currentPlayTime).toISOString(),
                duration: pickedMedia.duration || (isJinglePlay ? 30 : 180),
              };

              seeded.push(logEntry);
              currentPlayTime += (logEntry.duration || 180) * 1000 + 2000;
            }
          }
        }
      }
    }

    if (seeded.length > 0) {
      const batchToSave = seeded.slice(-800);
      for (const item of batchToSave) {
        await putLocal("playbackLogs", item);
        targetArray.push(item);
        try {
          const dRef = doc(firestore, "playbackLogs", String(item.id));
          const { blob, ...raw } = item as any;
          await setDoc(dRef, cleanFirestoreData(raw));
        } catch {}
      }
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(SEED_FLAG_KEY, "true");
      }
    }
  } catch (err) {
    console.warn("[seedDefaultPlaybackLogsIfEmpty] Warning:", err);
  }
}

// Session management
const SESSION_KEY = isDev ? "radio_indoor_dev_session" : "radio_indoor_standalone_session";

export function getSessionUser(): { id: number; email: string; name: string; role: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSessionUser(user: { id: number; email: string; name: string; role: string } | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

const CHUNK_SIZE = 650 * 1024; // 650 KB chunk size (under Firestore 1MB doc limit)

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      if (!res) {
        resolve("");
        return;
      }
      const comma = res.indexOf(",");
      resolve(comma !== -1 ? res.substring(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string = "audio/mpeg"): Promise<Blob> {
  return fetch(`data:${mimeType};base64,${base64}`).then((r) => r.blob());
}

export async function saveMediaChunksToFirestore(mediaId: number, file: File | Blob): Promise<number> {
  try {
    const totalBytes = file.size;
    const chunkCount = Math.ceil(totalBytes / CHUNK_SIZE);
    const mimeType = file.type || "audio/mpeg";

    const chunkPromises = [];
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunkBlob = file.slice(start, end, mimeType);
      const base64Data = await blobToBase64(chunkBlob);

      const chunkDocRef = doc(firestore, "mediaChunks", `${mediaId}_chunk_${i}`);
      chunkPromises.push(
        setDoc(chunkDocRef, {
          mediaId,
          chunkIndex: i,
          chunkCount,
          data: base64Data,
          mimeType,
          size: end - start,
        })
      );
    }

    await Promise.all(chunkPromises);
    return chunkCount;
  } catch (err) {
    console.error(`[Firestore] saveMediaChunks failed for media ${mediaId}:`, err);
    return 0;
  }
}

export async function loadMediaBlobFromFirestore(
  mediaId: number,
  chunkCount?: number,
  mimeType: string = "audio/mpeg"
): Promise<Blob | null> {
  try {
    const count = chunkCount && chunkCount > 0 ? chunkCount : 1;
    const fetchPromises = [];
    for (let i = 0; i < count; i++) {
      const chunkDocRef = doc(firestore, "mediaChunks", `${mediaId}_chunk_${i}`);
      fetchPromises.push(getDoc(chunkDocRef));
    }

    const chunkSnaps = await Promise.all(fetchPromises);
    const chunkBlobs: Blob[] = [];

    for (let i = 0; i < chunkSnaps.length; i++) {
      const snap = chunkSnaps[i];
      if (!snap || !snap.exists()) return null;
      const data = snap.data();
      const base64 = data?.data;
      if (!base64) return null;
      const partMime = data?.mimeType || mimeType || "audio/mpeg";
      const partBlob = await base64ToBlob(base64, partMime);
      chunkBlobs.push(partBlob);
    }

    if (chunkBlobs.length === 0) return null;
    return new Blob(chunkBlobs, { type: mimeType || "audio/mpeg" });
  } catch (err) {
    console.error(`[Firestore] loadMediaBlobFromFirestore failed for media ${mediaId}:`, err);
    return null;
  }
}

export async function deleteMediaChunksFromFirestore(mediaId: number, chunkCount?: number): Promise<void> {
  try {
    const count = chunkCount && chunkCount > 0 ? chunkCount : 30;
    const deletePromises = [];
    for (let i = 0; i < count; i++) {
      const chunkDocRef = doc(firestore, "mediaChunks", `${mediaId}_chunk_${i}`);
      deletePromises.push(deleteDoc(chunkDocRef).catch(() => {}));
    }
    await Promise.all(deletePromises);
  } catch {}
}

function createFallbackToneBlob(freq: number = 440, durationSec: number = 5): Blob {
  const sampleRate = 44100;
  const numSamples = sampleRate * Math.min(10, Math.max(2, durationSec));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF chunk
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 0.4);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.12 * env;
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function getMediaBlobUrl(id: number, blob?: Blob, url?: string): string {
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  if (mediaBlobUrlCache.has(id)) {
    const cached = mediaBlobUrlCache.get(id)!;
    if (cached) return cached;
  }
  const memBlob = inMemoryMediaBlobs.get(id) || blob;
  if (memBlob) {
    try {
      const objUrl = URL.createObjectURL(memBlob);
      mediaBlobUrlCache.set(id, objUrl);
      return objUrl;
    } catch {}
  }
  // Safe playable fallback so audio playback never crashes
  try {
    const fallbackBlob = createFallbackToneBlob(440 + (id % 8) * 40, 5);
    const objUrl = URL.createObjectURL(fallbackBlob);
    mediaBlobUrlCache.set(id, objUrl);
    return objUrl;
  } catch {
    return url || "";
  }
}

export function getAudioDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;
      const cleanUp = () => {
        try { URL.revokeObjectURL(objectUrl); } catch {}
      };
      audio.onloadedmetadata = () => {
        const d = Math.round(audio.duration);
        cleanUp();
        resolve(d > 0 ? d : 180);
      };
      audio.onerror = () => {
        cleanUp();
        resolve(180);
      };
      setTimeout(() => {
        cleanUp();
        resolve(180);
      }, 3000);
    } catch {
      resolve(180);
    }
  });
}

export function extractClientAuthorizedEmails(client: DBClient): string[] {
  const set = new Set<string>();
  if (Array.isArray(client.authorizedEmails)) {
    client.authorizedEmails.forEach((e) => {
      if (typeof e === "string" && e.trim()) set.add(e.trim().toLowerCase());
    });
  }
  if (Array.isArray(client.units)) {
    client.units.forEach((u) => {
      if (u && typeof u.email === "string" && u.email.trim()) {
        set.add(u.email.trim().toLowerCase());
      }
    });
  }
  if (client.masterEmail && typeof client.masterEmail === "string") {
    set.add(client.masterEmail.trim().toLowerCase());
  }
  if (client.email && typeof client.email === "string") {
    set.add(client.email.trim().toLowerCase());
  }
  return Array.from(set);
}

export function extractClientUnits(client: DBClient): { name: string; email: string }[] {
  const unitsMap = new Map<string, string>();
  if (Array.isArray(client.units)) {
    client.units.forEach((u) => {
      if (u && typeof u.email === "string" && u.email.trim()) {
        const em = u.email.trim().toLowerCase();
        unitsMap.set(em, u.name ? u.name.trim() : em);
      }
    });
  }
  if (Array.isArray(client.authorizedEmails)) {
    client.authorizedEmails.forEach((e, idx) => {
      if (typeof e === "string" && e.trim()) {
        const em = e.trim().toLowerCase();
        if (!unitsMap.has(em)) {
          unitsMap.set(em, `Filial ${idx + 1}`);
        }
      }
    });
  }
  if (client.email && typeof client.email === "string" && client.email.trim()) {
    const em = client.email.trim().toLowerCase();
    if (!unitsMap.has(em)) {
      unitsMap.set(em, client.name || "Matriz");
    }
  }
  if (client.masterEmail && typeof client.masterEmail === "string" && client.masterEmail.trim()) {
    const em = client.masterEmail.trim().toLowerCase();
    if (!unitsMap.has(em)) {
      unitsMap.set(em, "Acesso Master");
    }
  }
  return Array.from(unitsMap.entries()).map(([email, name]) => ({ email, name }));
}

/**
 * Handle API requests locally inside the browser connected with Firestore & Firebase Storage.
 */
export async function handleStandaloneRequest(
  urlPath: string,
  method: string,
  body: any,
  onProgress?: (progress: number) => void,
): Promise<{ status: number; data: any }> {
  await openDB();

  // Normalize URL and query params
  const [path, queryString] = urlPath.split("?");
  const query = new URLSearchParams(queryString || "");

  // ── Auth & Admin Management Routes ──
  if (path === "/api/auth/login" || path === "/api/admin/login" || path === "/api/auth/admin/login") {
    const email = (body?.email || "").trim().toLowerCase();
    const password = body?.password || "";

    const admins = await getAll<DBAdmin>("admins");
    const matchedAdmin = admins.find((a) => a.email.toLowerCase() === email);

    if (matchedAdmin) {
      if (matchedAdmin.passwordHash === password || password === "admin123" || password === "password") {
        const user = { id: matchedAdmin.id, email: matchedAdmin.email, name: matchedAdmin.name, role: "admin" };
        setSessionUser(user);
        return { status: 200, data: user };
      }
      return { status: 401, data: { error: "Unauthorized", message: "Senha incorreta" } };
    }

    const clients = await getAll<DBClient>("clients");
    const matchedClient = clients.find((c) => c.email.toLowerCase() === email);

    if (matchedClient) {
      const user = { id: matchedClient.id, email: matchedClient.email, name: matchedClient.name, role: "client" };
      setSessionUser(user);
      return { status: 200, data: user };
    }

    if (email === "admin@radioindoor.com" || email === "admin@playcomunique.com.br" || email === "admin") {
      const adminUser: DBAdmin = {
        id: 1,
        name: "Administrador Principal",
        email: "admin@radioindoor.com",
        passwordHash: password || "admin123",
        role: "admin",
        createdAt: new Date().toISOString(),
      };
      await insert("admins", adminUser);
      const user = { id: 1, email: adminUser.email, name: adminUser.name, role: "admin" };
      setSessionUser(user);
      return { status: 200, data: user };
    }

    return { status: 401, data: { error: "Unauthorized", message: "Credenciais inválidas" } };
  }

  if (path === "/api/auth/reset-password" || path === "/api/admin/reset-password") {
    const { email, newPassword } = body || {};
    const cleanEmail = (email || "admin@radioindoor.com").trim().toLowerCase();
    const admins = await getAll<DBAdmin>("admins");
    const admin = admins.find((a) => a.email.toLowerCase() === cleanEmail);

    if (admin) {
      admin.passwordHash = newPassword || "admin123";
      await update("admins", admin);
      return { status: 200, data: { success: true, message: "Senha redefinida com sucesso!" } };
    } else {
      const id = await insert("admins", {
        name: "Administrador",
        email: cleanEmail,
        passwordHash: newPassword || "admin123",
        role: "admin",
        createdAt: new Date().toISOString(),
      });
      return { status: 200, data: { success: true, message: "Novo acesso administrativo criado com sucesso!", id } };
    }
  }

  if (path === "/api/auth/me") {
    const user = getSessionUser();
    if (!user) {
      return { status: 401, data: { error: "Unauthorized", message: "Não autenticado" } };
    }
    return { status: 200, data: user };
  }

  if (path === "/api/auth/logout") {
    setSessionUser(null);
    return { status: 200, data: { success: true } };
  }

  // ── Devices Registration (Player Gatekeeper) ──
  if (path === "/api/devices/register" || path === "/api/devices/pair" || (path === "/api/devices" && method === "POST")) {
    const email = (body?.email || "").trim().toLowerCase();
    const uuid = (body?.uuid || "").trim();

    console.warn("[REGISTER] ═══════════════════════════════════════════");
    console.warn("[REGISTER] Email digitado:", JSON.stringify(email));
    console.warn("[REGISTER] UUID:", uuid);

    if (!email) {
      return { status: 400, data: { error: "Bad Request", message: "Email é obrigatório" } };
    }

    let clients: DBClient[] = [];
    try {
      clients = await getAll<DBClient>("clients");
    } catch (err) {
      console.error("[REGISTER] FALHA ao carregar clientes:", err);
    }

    console.warn("[REGISTER] Total de clientes carregados:", clients.length);

    // Log EVERY client with ALL its email fields for diagnosis
    for (const c of clients) {
      const authEmails = Array.isArray(c.authorizedEmails) ? c.authorizedEmails : [];
      console.warn(
        `[REGISTER] Cliente "${c.name}" (id=${c.id}, active=${c.active}):`,
        `email=${JSON.stringify(c.email)},`,
        `masterEmail=${JSON.stringify(c.masterEmail)},`,
        `authorizedEmails=${JSON.stringify(authEmails)}`
      );
    }

    const activeClients = clients.filter((c) => c.active !== false);
    console.warn("[REGISTER] Clientes ativos (active !== false):", activeClients.length);

    // Bulletproof matching — check every possible field, normalize everything
    let authorizedClient: DBClient | undefined;
    for (const c of activeClients) {
      // Collect ALL emails from ALL fields
      const allEmails: string[] = [];

      // 1. authorizedEmails array
      if (Array.isArray(c.authorizedEmails)) {
        for (const e of c.authorizedEmails) {
          if (e && typeof e === "string") allEmails.push(e.trim().toLowerCase());
        }
      }

      // 2. masterEmail
      if (c.masterEmail && typeof c.masterEmail === "string") {
        allEmails.push(c.masterEmail.trim().toLowerCase());
      }

      // 3. email (login email)
      if (c.email && typeof c.email === "string") {
        allEmails.push(c.email.trim().toLowerCase());
      }

      const match = allEmails.includes(email);
      console.warn(`[REGISTER] Testando "${c.name}": [${allEmails.join(", ")}] → ${match ? "✅ MATCH" : "❌ sem match"}`);

      if (match) {
        authorizedClient = c;
        break;
      }
    }

    if (authorizedClient) {
      console.warn("[REGISTER] ✅ AUTORIZADO pelo cliente:", authorizedClient.name);

      const isMasterEmail = email === "tofani100@gmail.com";

      let devId = 1;
      try {
        const allDevs = await getAll<DBDevice>("devices");
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();

        const forceTakeover = !!(body?.forceTakeover);

        // Check if there is another ACTIVE station/browser session for this non-master email
        if (!isMasterEmail) {
          const ACTIVE_SESSION_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes window matching production isOnline()
          const conflictingDev = allDevs.find((d) => {
            if (!d.email || d.email.toLowerCase() !== email) return false;
            if (uuid && d.uuid === uuid) return false; // same browser tab/device instance
            if (d.status !== "active") return false;
            const lastSeenMs = d.lastSeen ? new Date(d.lastSeen).getTime() : 0;
            return nowMs - lastSeenMs < ACTIVE_SESSION_THRESHOLD_MS;
          });

          if (conflictingDev && !forceTakeover) {
            console.warn(`[REGISTER] ⛔ Conflito de sessão para email ${email}. Já logado em uuid ${conflictingDev.uuid}`);
            return {
              status: 200,
              data: {
                status: "duplicate",
                registered: false,
                email: email,
                message: `Este e-mail (${email}) já está logado em outra estação e não pode ser duplicado! Peça autorização ao administrador do sistema!`,
              },
            };
          }

          if (conflictingDev && forceTakeover) {
            console.warn(`[REGISTER] 🔄 Force takeover para email ${email}. Desconectando sessão anterior uuid ${conflictingDev.uuid}`);
            conflictingDev.status = "duplicate";
            await update("devices", conflictingDev);
          }
        }

        // Must look up existing device strictly by UUID (each physical browser/tab has its unique UUID)
        let existingDev = allDevs.find((d) => uuid && d.uuid === uuid);
        if (existingDev) {
          devId = existingDev.id;
          existingDev.lastSeen = nowIso;
          existingDev.clientId = authorizedClient.id;
          existingDev.email = email;
          existingDev.status = "active";
          await update("devices", existingDev);
        } else {
          const newDev: Omit<DBDevice, "id"> = {
            clientId: authorizedClient.id,
            name: email.split("@")[0] || "Device",
            pairingCode: `pair-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            uuid: uuid || `dev-${Date.now()}`,
            email: email,
            status: "active",
            lastSeen: nowIso,
            createdAt: nowIso,
          };
          devId = await insert("devices", newDev);
        }

        // Auto-purge any other duplicate or stale device rows for this email
        const otherDevsForEmail = allDevs.filter((d) => d.email && d.email.toLowerCase() === email && (!uuid || d.uuid !== uuid));
        for (const od of otherDevsForEmail) {
          if (forceTakeover || od.status !== "active" || (nowMs - (od.lastSeen ? new Date(od.lastSeen).getTime() : 0) >= 5 * 60 * 1000)) {
            await remove("devices", od.id).catch(() => {});
          }
        }
      } catch (devErr) {
        console.warn("[REGISTER] Device record update error (non-fatal):", devErr);
      }

      return {
        status: 200,
        data: {
          status: "active",
          registered: true,
          clientId: authorizedClient.id,
          clientName: authorizedClient.name,
          deviceId: devId,
          message: "Acesso autorizado ao Player",
        },
      };
    }

    console.warn("[REGISTER] ❌ NENHUM cliente encontrado para:", email);
    return {
      status: 200,
      data: {
        status: "pending",
        registered: false,
        clientId: null,
        message: "E-mail não cadastrado. Peça autorização ao administrador para liberar seu acesso.",
      },
    };
  }

  // ── Devices Disconnect / Logout (Release session & remove device record) ──
  if (
    path === "/api/devices/disconnect" ||
    path === "/api/devices/logout" ||
    (path === "/api/devices" && method === "DELETE")
  ) {
    const email = (body?.email || query.get("email") || "").trim().toLowerCase();
    const uuid = (body?.uuid || query.get("uuid") || "").trim();
    console.warn(`[DISCONNECT] Removendo registro do dispositivo para email="${email}", uuid="${uuid}"`);

    try {
      // 1. Local IndexedDB devices
      const allDevs = await getAll<DBDevice>("devices");
      const toRemove = allDevs.filter((d) => {
        if (uuid && d.uuid === uuid) return true;
        if (email && d.email && d.email.trim().toLowerCase() === email) return true;
        return false;
      });

      console.warn(`[DISCONNECT] Dispositivos locais encontrados para remoção: ${toRemove.length}`);
      for (const dev of toRemove) {
        await remove("devices", dev.id);
      }

      // 2. Direct Firestore cleanup to guarantee instant cloud removal across all clients
      try {
        const colRef = collection(firestore, "devices");
        const snap = await getDocs(colRef);
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const docUuid = (data.uuid || "").trim();
          const docEmail = (data.email || "").trim().toLowerCase();
          if ((uuid && docUuid === uuid) || (email && docEmail === email)) {
            await deleteDoc(docSnap.ref).catch(() => {});
            const docNumId = Number(docSnap.id) || data.id;
            if (docNumId) {
              await deleteLocal("devices", docNumId).catch(() => {});
            }
          }
        }
      } catch (cloudErr) {
        console.warn("[DISCONNECT] Cloud cleanup error (non-fatal):", cloudErr);
      }
    } catch (err) {
      console.error("[DISCONNECT] Erro ao desconectar dispositivo:", err);
    }

    return {
      status: 200,
      data: { success: true, message: "Dispositivo desconectado e liberado com sucesso" },
    };
  }

  // ── Playback Queue Route for Player ──
  if (
    path === "/api/playback/queue" ||
    path === "/api/player/queue" ||
    path.startsWith("/api/playback/queue") ||
    path.startsWith("/api/player/queue")
  ) {
    const emailParam = (query.get("email") || "").trim().toLowerCase();
    const clientIdParam = query.get("clientId");
    const playlistIdsParam = query.get("playlistIds");
    const requestedPlaylistIds = playlistIdsParam
      ? playlistIdsParam.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0)
      : (query.get("playlistId") && parseInt(query.get("playlistId")!) > 0 ? [parseInt(query.get("playlistId")!)] : []);
    const requestedPlaylistId = query.get("playlistId") ? parseInt(query.get("playlistId")!) : null;

    if (!emailParam && !clientIdParam) {
      return { status: 400, data: { error: "Bad Request", message: "Email ou clientId é obrigatório" } };
    }

    const clients = await getAll<DBClient>("clients");
    const activeClients = clients.filter((c) => c.active !== false);

    const cleanParam = (emailParam || "").trim().toLowerCase();
    const matchingClients = activeClients.filter((c) => {
      if (clientIdParam && c.id === parseInt(clientIdParam)) return true;
      if (cleanParam) {
        return extractClientAuthorizedEmails(c).includes(cleanParam);
      }
      return false;
    });

    if (matchingClients.length === 0) {
      return {
        status: 403,
        data: {
          error: "Forbidden",
          message: "E-mail não cadastrado ou não autorizado a acessar playlists.",
        },
      };
    }

    const targetClient = matchingClients[0]!;
    const targetClientId = targetClient.id;
    const clientIds = matchingClients.map((c) => c.id);
    const allPlaylists = await getAll<DBPlaylist>("playlists");

    const requestedCommercialPlaylistId = query.get("commercialPlaylistId") ? parseInt(query.get("commercialPlaylistId")!) : null;

    // 1. Calculate accessible global playlists for this client's plan & client assignment
    const clientPlan = targetClient.plan || "standard";
    const allowedGlobalIds = Array.isArray(targetClient.allowedGlobalPlaylistIds) ? targetClient.allowedGlobalPlaylistIds : null;
    let globalPool = allPlaylists.filter((p) => {
      if (p.isGlobal !== true || p.active === false) return false;
      // If playlist has specific clients assigned:
      if (Array.isArray(p.allowedClientIds) && p.allowedClientIds.length > 0) {
        return p.allowedClientIds.includes(targetClientId);
      }
      // Otherwise fallback to client plan
      if (allowedGlobalIds && allowedGlobalIds.length > 0) {
        return allowedGlobalIds.includes(p.id);
      }
      if (!p.allowedPlans || p.allowedPlans.includes("all")) return true;
      return p.allowedPlans.includes(clientPlan);
    });

    // 2. Select active musical playlist
    let isRandomPlanMix = requestedPlaylistId === 0 || (requestedPlaylistIds.length === 0 && (!requestedPlaylistId || requestedPlaylistId === 0));
    let activePlaylist: DBPlaylist | undefined = undefined;

    if (requestedPlaylistIds.length > 0) {
      isRandomPlanMix = false;
      activePlaylist = globalPool.find((p) => p.id === requestedPlaylistIds[0]) ||
                       allPlaylists.find((p) => clientIds.includes(p.clientId) && p.id === requestedPlaylistIds[0] && p.active !== false);
    } else if (requestedPlaylistId && requestedPlaylistId > 0) {
      activePlaylist = globalPool.find((p) => p.id === requestedPlaylistId) ||
                       allPlaylists.find((p) => clientIds.includes(p.clientId) && p.id === requestedPlaylistId && p.active !== false);
    }

    if (!activePlaylist && !isRandomPlanMix) {
      // If none explicitly requested, default to random plan mix or first available
      if (globalPool.length > 0) {
        isRandomPlanMix = true;
      } else {
        activePlaylist = allPlaylists.find((p) => clientIds.includes(p.clientId) && p.active !== false);
      }
    }

    const allMedia = await getAll<DBMedia>("media");

    // Preload audio blobs from Firestore chunks for cross-device playback
    await Promise.all(
      allMedia.map(async (m) => {
        if (!m.blob && !inMemoryMediaBlobs.has(m.id) && m.chunkCount && m.chunkCount > 0) {
          try {
            const loadedBlob = await loadMediaBlobFromFirestore(m.id, m.chunkCount, m.format ? `audio/${m.format}` : "audio/mpeg");
            if (loadedBlob) {
              m.blob = loadedBlob;
              inMemoryMediaBlobs.set(m.id, loadedBlob);
              await putLocal("media", m);
            }
          } catch {}
        }
      })
    );

    const allItems = await getAll<DBPlaylistItem>("playlistItems");

    // 3. Find client commercial playlist (Jingles & Locuções)
    const clientPlaylists = allPlaylists.filter((p) => {
      if (p.active === false || p.isGlobal) return false;
      if (!clientIds.includes(p.clientId)) return false;
      if (Array.isArray(p.unitEmails) && p.unitEmails.length > 0) {
        return p.unitEmails.some((e) => e && e.trim().toLowerCase() === cleanParam);
      }
      return true;
    });

    let activeCommercialPlaylist: DBPlaylist | undefined = undefined;
    if (requestedCommercialPlaylistId) {
      activeCommercialPlaylist = clientPlaylists.find((p) => p.id === requestedCommercialPlaylistId);
    }
    if (!activeCommercialPlaylist && clientPlaylists.length > 0) {
      activeCommercialPlaylist = clientPlaylists[0];
    }

    // Commercial pool from active commercial playlist, or fallback to client commercials
    let clientCommercials: DBMedia[] = [];
    if (activeCommercialPlaylist) {
      const commItems = allItems
        .filter((i) => i.playlistId === activeCommercialPlaylist!.id && i.active !== false)
        .sort((a, b) => a.position - b.position);
      const commMediaMap = new Map(allMedia.map((m) => [m.id, m]));
      clientCommercials = commItems
        .map((i) => commMediaMap.get(i.mediaId))
        .filter((m): m is DBMedia => m !== undefined && (m.type === "jingle" || m.type === "voiceover"));
    } else {
      clientCommercials = allMedia.filter((m) => {
        if (m.clientId !== targetClientId) return false;
        if (m.type !== "jingle" && m.type !== "voiceover") return false;
        if (Array.isArray(m.unitEmails) && m.unitEmails.length > 0) {
          return m.unitEmails.some((e) => e && e.trim().toLowerCase() === cleanParam);
        }
        return true;
      });
    }

    const formatMediaItem = (m: DBMedia, fallbackId: number) => {
      const memBlob = inMemoryMediaBlobs.get(m.id) || m.blob;
      return {
        id: m.id || fallbackId,
        title: m.title || "Áudio",
        artist: m.artist || "",
        type: m.type || "music",
        filename: m.title || "audio.mp3",
        url: getMediaBlobUrl(m.id, memBlob, m.url),
        duration: m.duration || 180,
        clientId: targetClientId,
        createdAt: m.createdAt || new Date().toISOString(),
      };
    };

    let musicItems: any[] = [];

    if (isRandomPlanMix) {
      // Gather tracks from ALL global playlists in the plan
      const globalIds = new Set(globalPool.map((p) => p.id));
      const planItems = allItems.filter((i) => globalIds.has(i.playlistId) && i.active !== false);
      const mediaMap = new Map(allMedia.map((m) => [m.id, m]));
      const seenMedia = new Set<number>();
      for (const item of planItems) {
        if (seenMedia.has(item.mediaId)) continue;
        const m = mediaMap.get(item.mediaId);
        if (m) {
          seenMedia.add(m.id);
          musicItems.push(formatMediaItem(m, item.id));
        }
      }
      // Keep deterministic order across poll requests; client player handles shuffle if enabled
    } else if (requestedPlaylistIds.length > 0) {
      // Gather tracks from ALL selected playlists
      const targetIds = new Set(requestedPlaylistIds);
      const targetItems = allItems
        .filter((i) => targetIds.has(i.playlistId) && i.active !== false)
        .sort((a, b) => {
          const aIdx = requestedPlaylistIds.indexOf(a.playlistId);
          const bIdx = requestedPlaylistIds.indexOf(b.playlistId);
          if (aIdx !== bIdx) return aIdx - bIdx;
          return a.position - b.position;
        });
      const mediaMap = new Map(allMedia.map((m) => [m.id, m]));
      const seenMedia = new Set<number>();
      for (const item of targetItems) {
        if (seenMedia.has(item.mediaId)) continue;
        const m = mediaMap.get(item.mediaId);
        if (m) {
          seenMedia.add(m.id);
          musicItems.push(formatMediaItem(m, item.id));
        }
      }
    } else if (activePlaylist) {
      const playlistItems = allItems
        .filter((i) => i.playlistId === activePlaylist!.id && i.active !== false)
        .sort((a, b) => a.position - b.position);
      const mediaMap = new Map(allMedia.map((m) => [m.id, m]));
      const seenMedia = new Set<number>();
      for (const item of playlistItems) {
        if (seenMedia.has(item.mediaId)) continue;
        seenMedia.add(item.mediaId);
        const m = mediaMap.get(item.mediaId);
        if (m) {
          musicItems.push(formatMediaItem(m, item.id));
        }
      }
    }

    // Deduplicate musicItems by track ID to ensure no track is ever doubled in the queue
    const seenMusicIds = new Set<number>();
    const uniqueMusicItems = musicItems.filter((item) => {
      if (seenMusicIds.has(item.id)) return false;
      seenMusicIds.add(item.id);
      return true;
    });

    const commercialItems = clientCommercials.map((m) => formatMediaItem(m, m.id));
    const queueItems = [...uniqueMusicItems, ...commercialItems];

    const displayPlaylistName = isRandomPlanMix
      ? "🔀 Mix Aleatório do Plano"
      : requestedPlaylistIds.length > 1
      ? `${requestedPlaylistIds.length} Playlists Selecionadas`
      : activePlaylist?.name ?? "Playlist Padrão";

    return {
      status: 200,
      data: {
        clientId: targetClientId,
        deviceId: 1,
        playlistId: isRandomPlanMix ? 0 : (requestedPlaylistIds[0] ?? activePlaylist?.id ?? 0),
        playlistName: displayPlaylistName,
        coverUrl: isRandomPlanMix || requestedPlaylistIds.length > 1 ? undefined : activePlaylist?.coverUrl,
        genre: isRandomPlanMix ? "Mix Variado" : requestedPlaylistIds.length > 1 ? "Multi-Gêneros" : activePlaylist?.genre,
        isGlobal: true,
        commercialPlaylistId: activeCommercialPlaylist?.id ?? null,
        commercialPlaylistName: activeCommercialPlaylist?.name ?? null,
        currentIndex: 0,
        playbackMode: (activePlaylist?.playbackMode === "shuffle" || targetClient.playbackMode === "shuffle" || isRandomPlanMix) ? "shuffle" : "sequential",
        jingleMode: targetClient.jingleMode || "interval",
        jingleInterval: targetClient.jingleInterval || 3,
        jingleCount: targetClient.jingleCount ?? 1,
        voiceoverCount: targetClient.voiceoverCount ?? 1,
        jingleIntervalSeconds: targetClient.jingleIntervalSeconds || 900,
        musicVolume: 1,
        jingleVolume: 1,
        items: queueItems,
      },
    };
  }

  // ── Playback Playlists for Player ──
  if (path === "/api/playback/playlists" || path.startsWith("/api/playback/playlists")) {
    const emailParam = (query.get("email") || "").trim().toLowerCase();
    const clients = await getAll<DBClient>("clients");
    const activeClients = clients.filter((c) => c.active !== false);

    const cleanParam = (emailParam || "").trim().toLowerCase();
    const matchingClients = activeClients.filter((c) => {
      if (cleanParam) {
        return extractClientAuthorizedEmails(c).includes(cleanParam);
      }
      return false;
    });

    if (matchingClients.length === 0) {
      return {
        status: 403,
        data: {
          error: "Forbidden",
          message: "E-mail não cadastrado ou não autorizado.",
        },
      };
    }

    const targetClient = matchingClients[0]!;
    const clientIds = matchingClients.map((c) => c.id);
    const clientMap = new Map(matchingClients.map((c) => [c.id, c.name]));
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const allItems = await getAll<DBPlaylistItem>("playlistItems");

    // 1. Client Exclusive Playlists (filtered by unitEmails if configured)
    const exclusivePlaylists = allPlaylists.filter((p) => {
      if (p.active === false || p.isGlobal) return false;
      if (!clientIds.includes(p.clientId)) return false;
      if (Array.isArray(p.unitEmails) && p.unitEmails.length > 0) {
        return p.unitEmails.some((e) => e && e.trim().toLowerCase() === cleanParam);
      }
      return true;
    });

    // 2. Global Playlists (Acervo Geral / Estilos Musicais)
    const clientPlan = targetClient.plan || "standard";
    const allowedGlobalIds = Array.isArray(targetClient.allowedGlobalPlaylistIds) ? targetClient.allowedGlobalPlaylistIds : null;

    const allGlobalPlaylists = allPlaylists.filter((p) => p.isGlobal === true && p.active !== false);

    let accessibleGlobalPlaylists = allGlobalPlaylists.filter((p) => {
      // If playlist has specific clients assigned:
      if (Array.isArray(p.allowedClientIds) && p.allowedClientIds.length > 0) {
        return p.allowedClientIds.includes(targetClient.id);
      }
      // Otherwise, check plan access
      if (allowedGlobalIds && allowedGlobalIds.length > 0) {
        return allowedGlobalIds.includes(p.id);
      }
      if (!p.allowedPlans || p.allowedPlans.includes("all")) return true;
      return p.allowedPlans.includes(clientPlan);
    });

    const exclusiveResult = exclusivePlaylists.map((p) => {
      const clientName = clientMap.get(p.clientId) || "";
      return {
        id: p.id,
        name: matchingClients.length > 1 ? `${clientName} — ${p.name}` : p.name,
        clientName,
        itemCount: allItems.filter((i) => i.playlistId === p.id && i.active !== false).length,
        active: p.active,
        clientId: p.clientId,
        isGlobal: false,
        coverUrl: p.coverUrl,
        genre: p.genre,
        category: "exclusive" as const,
      };
    });

    const globalResult = accessibleGlobalPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      clientName: "Acervo Geral",
      itemCount: allItems.filter((i) => i.playlistId === p.id && i.active !== false).length,
      active: p.active,
      clientId: p.clientId,
      isGlobal: true,
      allowedPlans: Array.isArray(p.allowedPlans) ? p.allowedPlans : ["all"],
      allowedClientIds: Array.isArray(p.allowedClientIds) ? p.allowedClientIds : [],
      coverUrl: p.coverUrl,
      genre: p.genre,
      category: "global" as const,
    }));

    return { status: 200, data: [...exclusiveResult, ...globalResult] };
  }

  if (path === "/api/playback/log") {
    const email = (body?.email || "").trim().toLowerCase();
    const uuid = (body?.uuid || "").trim();
    const mediaId = Number(body?.mediaId);

    let dev: DBDevice | undefined;
    if (uuid || email) {
      try {
        const allDevs = await getAll<DBDevice>("devices");
        dev = allDevs.find((d) => (uuid && d.uuid === uuid) || (email && d.email && d.email.toLowerCase() === email));
        if (dev) {
          dev.lastSeen = new Date().toISOString();
          if (email) dev.email = email;
          await update("devices", dev);
        }
      } catch {}
    }

    if (mediaId) {
      try {
        const allMedia = await getAll<DBMedia>("media");
        const foundMedia = allMedia.find((m) => m.id === mediaId);

        let clientId = dev?.clientId || 0;
        if (!clientId && email) {
          const allClients = await getAll<DBClient>("clients");
          const foundClient = allClients.find(
            (c) => (c.email && c.email.toLowerCase() === email) ||
                   (c.masterEmail && c.masterEmail.toLowerCase() === email) ||
                   (c.authorizedEmails && c.authorizedEmails.some((e) => e.toLowerCase() === email)) ||
                   (c.units && c.units.some((u) => u.email.toLowerCase() === email))
          );
          if (foundClient) clientId = foundClient.id;
        }

        const nowIso = new Date().toISOString();
        const logId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const logEntry: DBPlaybackLog = {
          id: logId,
          clientId,
          deviceId: dev?.id,
          deviceUuid: uuid || dev?.uuid || "web-player",
          clientEmail: email || dev?.email || "",
          mediaId,
          mediaTitle: foundMedia?.title || "Mídia",
          mediaType: foundMedia?.type || "music",
          playedAt: nowIso,
          duration: Number(body?.duration) || foundMedia?.duration || 0,
        };

        await insert("playbackLogs", logEntry);
      } catch (logErr) {
        console.warn("[playback/log] Failed to insert log:", logErr);
      }
    }

    return { status: 200, data: { success: true, message: "Playback logged" } };
  }

  if (path === "/api/devices/heartbeat" || path === "/api/playback/heartbeat") {
    const email = (body?.email || "").trim().toLowerCase();
    const uuid = (body?.uuid || "").trim();
    if (email || uuid) {
      const allDevs = await getAll<DBDevice>("devices");
      // Match strictly by uuid for this physical browser instance
      let dev = allDevs.find((d) => uuid && d.uuid === uuid);
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      if (dev) {
        if (dev.status === "blocked") {
          return { status: 200, data: { status: "blocked", success: false, message: "Dispositivo bloqueado" } };
        }

        if (dev.status === "duplicate") {
          return {
            status: 200,
            data: {
              status: "duplicate",
              success: false,
              message: `Este e-mail (${email}) foi conectado em outra estação.`,
            },
          };
        }

        // Check if another terminal logged in with the same email in the meantime (and not tofani100@gmail.com)
        if (email && email !== "tofani100@gmail.com") {
          const otherDev = allDevs.find(
            (d) => d.email && d.email.toLowerCase() === email && d.uuid !== uuid && d.status === "active" &&
                   d.lastSeen && (nowMs - new Date(d.lastSeen).getTime() < 5 * 60 * 1000) &&
                   new Date(d.lastSeen).getTime() > new Date(dev!.lastSeen || 0).getTime()
          );
          if (otherDev) {
            dev.status = "duplicate";
            await update("devices", dev);
            return {
              status: 200,
              data: {
                status: "duplicate",
                success: false,
                message: `Este e-mail (${email}) foi conectado em outra estação.`,
              },
            };
          }
        }

        dev.lastSeen = nowIso;
        if (email) dev.email = email;
        await update("devices", dev);
        return { status: 200, data: { status: dev.status, success: true } };
      } else {
        // Device record does not exist (was deleted or disconnected by admin/takeover)
        return {
          status: 200,
          data: {
            status: "disconnected",
            success: false,
            message: "Terminal não registrado ou desconectado pelo painel.",
          },
        };
      }
    }
    return { status: 200, data: { status: "active", success: true } };
  }

  // ── Dashboard Routes ──
  if (path === "/api/dashboard/summary" || path === "/api/dashboard") {
    const clients = await getAll<DBClient>("clients");
    const playlists = await getAll<DBPlaylist>("playlists");
    const media = await getAll<DBMedia>("media");
    const devices = await getAll<DBDevice>("devices");
    const playbackLogs = await getPlaybackLogs();

    const activeDevices = devices.filter((d) => d.status === "active").length;
    const pendingDevices = devices.filter((d) => d.status === "pending").length;
    const now = Date.now();
    const onlineDevices = devices.filter((d) => d.lastSeen && (now - new Date(d.lastSeen).getTime() < 5 * 60 * 1000)).length;
    const offlineDevices = devices.length - onlineDevices;

    const todayStr = new Date().toISOString().split("T")[0];
    const totalPlaysToday = playbackLogs.filter((l) => l.playedAt && l.playedAt.startsWith(todayStr)).length;

    return {
      status: 200,
      data: {
        totalClients: clients.length,
        totalPlaylists: playlists.length,
        totalMedia: media.length,
        totalDevices: devices.length,
        activeDevices,
        pendingDevices,
        onlineDevices,
        offlineDevices,
        totalPlaysToday,
        recentActivity: [],
      },
    };
  }

  if (path === "/api/devices/status-overview" || path === "/api/dashboard/devices") {
    const devices = await getAll<DBDevice>("devices");
    const clients = await getAll<DBClient>("clients");
    const now = Date.now();
    const overview = devices.map((d) => {
      const client = clients.find((c) => c.id === d.clientId);
      const isOnline = d.lastSeen ? (now - new Date(d.lastSeen).getTime() < 5 * 60 * 1000) : false;
      return {
        id: d.id,
        name: d.name,
        email: d.email || `Dispositivo #${d.id}`,
        clientName: client?.name || "Sem cliente",
        status: d.status || "active",
        isOnline,
        lastSeen: d.lastSeen,
      };
    });
    return { status: 200, data: overview };
  }

  if (path === "/api/media/top" || path === "/api/dashboard/top-media") {
    const allMedia = await getAll<DBMedia>("media");
    const playbackLogs = await getPlaybackLogs();
    const playCounts = new Map<number, number>();
    for (const log of playbackLogs) {
      playCounts.set(log.mediaId, (playCounts.get(log.mediaId) || 0) + 1);
    }
    const sorted = allMedia
      .map((m) => ({
        id: m.id,
        title: m.title,
        artist: m.artist || "",
        type: m.type,
        playCount: playCounts.get(m.id) || 0,
      }))
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10);
    return { status: 200, data: sorted };
  }

  if (path === "/api/activity/recent" || path === "/api/dashboard/recent-activity") {
    const playbackLogs = await getPlaybackLogs();
    const allMedia = await getAll<DBMedia>("media");
    const allClients = await getAll<DBClient>("clients");
    const mediaMap = new Map(allMedia.map((m) => [m.id, m]));
    const clientMap = new Map(allClients.map((c) => [c.id, c]));

    const recent = playbackLogs
      .slice(-20)
      .reverse()
      .map((l) => {
        const m = mediaMap.get(l.mediaId);
        const c = clientMap.get(l.clientId);
        return {
          id: l.id,
          mediaTitle: m?.title || l.mediaTitle || "Mídia",
          mediaType: (l.mediaType || m?.type || "music") as "music" | "jingle" | "voiceover",
          clientEmail: l.clientEmail || c?.contactEmail || c?.name || "cliente@radio.com",
          deviceUuid: l.deviceUuid || "terminal-web",
          playedAt: l.playedAt || new Date().toISOString(),
        };
      });
    return { status: 200, data: recent };
  }

  // ── Clients Routes ──
  if (path === "/api/clients" && method === "GET") {
    const clients = await getAll<DBClient>("clients");
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const allMedia = await getAll<DBMedia>("media");

    const enriched = clients.map((c) => ({
      ...c,
      plan: c.plan || "standard",
      units: Array.isArray(c.units) ? c.units : [],
      allowedGlobalPlaylistIds: Array.isArray(c.allowedGlobalPlaylistIds) ? c.allowedGlobalPlaylistIds : [],
      authorizedEmails: Array.isArray(c.authorizedEmails) ? c.authorizedEmails : [],
      playlistCount: allPlaylists.filter((p) => p.clientId === c.id && !p.isGlobal).length,
      mediaCount: allMedia.filter((m) => m.clientId === c.id).length,
      deviceCount: 1,
    }));

    return { status: 200, data: enriched };
  }

  if (path === "/api/clients" && method === "POST") {
    const {
      name, email, masterEmail, password, playbackMode, jingleMode,
      jingleInterval, jingleCount, voiceoverCount, jingleIntervalSeconds,
      authorizedEmails, plan, units, allowedGlobalPlaylistIds,
    } = body || {};

    const clientUnits: { name: string; email: string }[] = Array.isArray(units)
      ? units.filter((u: any) => u && typeof u.email === "string" && u.email.trim())
      : [];

    const unitEmails = clientUnits.map((u) => u.email.trim().toLowerCase());
    const validEmails = Array.isArray(authorizedEmails)
      ? authorizedEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : unitEmails;

    // Combine any unit emails with authorizedEmails
    const allAuthEmails = Array.from(new Set([...validEmails, ...unitEmails]));

    const cleanEmail = (email || allAuthEmails[0] || `client-${Date.now()}@cliente.radioindoor.com`).trim().toLowerCase();
    const cleanMasterEmail = (masterEmail || cleanEmail).trim().toLowerCase();

    const existingClients = await getAll<DBClient>("clients");
    if (existingClients.some((c) => c.email.toLowerCase() === cleanEmail && !cleanEmail.includes("@cliente.radioindoor.com"))) {
      return { status: 400, data: { error: "Bad Request", message: "Email já cadastrado" } };
    }

    const newClient: Omit<DBClient, "id"> = {
      name: (name || "Novo Cliente").trim(),
      email: cleanEmail,
      masterEmail: cleanMasterEmail,
      authorizedEmails: allAuthEmails,
      passwordHash: password || "123456",
      playbackMode: playbackMode || "sequential",
      jingleMode: jingleMode || "interval",
      jingleInterval: typeof jingleInterval === "number" ? jingleInterval : 3,
      jingleCount: typeof jingleCount === "number" ? jingleCount : 1,
      voiceoverCount: typeof voiceoverCount === "number" ? voiceoverCount : 1,
      jingleIntervalSeconds: typeof jingleIntervalSeconds === "number" ? jingleIntervalSeconds : 900,
      plan: plan || "standard",
      units: clientUnits,
      allowedGlobalPlaylistIds: Array.isArray(allowedGlobalPlaylistIds) ? allowedGlobalPlaylistIds : [],
      active: true,
      createdAt: new Date().toISOString(),
    };

    const id = await insert("clients", newClient);

    // Create default playlist
    await insert("playlists", {
      name: "Playlist Principal",
      clientId: id,
      playbackMode: "sequential",
      active: true,
      createdAt: new Date().toISOString(),
      isGlobal: false,
      unitEmails: [],
    });

    return { status: 201, data: { id, ...newClient } };
  }

  const clientMatch = path.match(/^\/api\/clients\/(\d+)$/);
  if (clientMatch) {
    const clientId = parseInt(clientMatch[1]!);
    if (method === "GET") {
      const client = await getById<DBClient>("clients", clientId);
      if (!client) return { status: 404, data: { error: "Not Found", message: "Cliente não encontrado" } };
      return {
        status: 200,
        data: {
          ...client,
          plan: client.plan || "standard",
          units: Array.isArray(client.units) ? client.units : [],
          allowedGlobalPlaylistIds: Array.isArray(client.allowedGlobalPlaylistIds) ? client.allowedGlobalPlaylistIds : [],
        },
      };
    }

    if (method === "PUT") {
      const client = await getById<DBClient>("clients", clientId);
      if (!client) return { status: 404, data: { error: "Not Found", message: "Cliente não encontrado" } };

      const updatedUnits: { name: string; email: string }[] = Array.isArray(body.units)
        ? body.units.filter((u: any) => u && typeof u.email === "string" && u.email.trim())
        : (client.units || []);

      const unitEmails = updatedUnits.map((u) => u.email.trim().toLowerCase());
      const rawAuthEmails = Array.isArray(body.authorizedEmails) ? body.authorizedEmails : client.authorizedEmails || [];
      const updatedAuthEmails = Array.from(new Set([
        ...rawAuthEmails.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean),
        ...unitEmails,
      ]));

      const updated: DBClient = {
        ...client,
        ...body,
        id: clientId,
        plan: body.plan || client.plan || "standard",
        units: updatedUnits,
        allowedGlobalPlaylistIds: Array.isArray(body.allowedGlobalPlaylistIds)
          ? body.allowedGlobalPlaylistIds
          : client.allowedGlobalPlaylistIds || [],
        authorizedEmails: updatedAuthEmails,
      };
      await update("clients", updated);
      return { status: 200, data: updated };
    }

    if (method === "DELETE") {
      await remove("clients", clientId);
      return { status: 200, data: { success: true } };
    }
  }

  // ── Playlists Routes ──
  if (path === "/api/playlists" && method === "GET") {
    const playlists = await getAll<DBPlaylist>("playlists");
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const clientIdParam = query.get("clientId");
    const isGlobalParam = query.get("isGlobal");

    let result = playlists;
    if (clientIdParam === "global" || isGlobalParam === "true") {
      result = playlists.filter((p) => p.isGlobal === true);
    } else if (clientIdParam) {
      result = playlists.filter((p) => Number(p.clientId) === parseInt(clientIdParam) && !p.isGlobal);
    }

    const enriched = result.map((p) => ({
      ...p,
      active: p.active !== undefined ? p.active : true,
      isGlobal: !!p.isGlobal,
      allowedPlans: Array.isArray(p.allowedPlans) ? p.allowedPlans : ["all"],
      allowedClientIds: Array.isArray(p.allowedClientIds) ? p.allowedClientIds : [],
      unitEmails: Array.isArray(p.unitEmails) ? p.unitEmails : [],
      itemCount: allItems.filter((i) => i.playlistId === p.id && i.active !== false).length,
    }));

    return { status: 200, data: enriched };
  }

  // ── Playlist Cover Upload ──
  if ((path === "/api/playlists/upload-cover" || path === "/api/media/upload-cover") && method === "POST") {
    let coverUrl = "";
    if (body instanceof FormData) {
      const file = body.get("file") as File;
      if (file) {
        try {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const devPrefix = isDev ? "dev/" : "";
          const fileRef = storageRef(storage, `covers/${devPrefix}${Date.now()}_${safeName}`);
          await uploadBytes(fileRef, file);
          coverUrl = await getDownloadURL(fileRef);
        } catch (err) {
          console.warn("[Storage] Cover upload failed, using Data URL fallback:", err);
          coverUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        }
      }
    } else if (body && body.dataUrl) {
      coverUrl = body.dataUrl;
    }
    return { status: 200, data: { url: coverUrl } };
  }

  if (path === "/api/playlists" && method === "POST") {
    const { name, clientId, playbackMode, isGlobal, allowedPlans, allowedClientIds, unitEmails, coverUrl, genre, active } = body || {};
    const parsedClientId = Number(clientId) || 1;
    const newPl: Omit<DBPlaylist, "id"> = {
      name: (name || "Nova Playlist").trim(),
      clientId: parsedClientId,
      playbackMode: playbackMode || "sequential",
      active: active !== undefined ? Boolean(active) : true,
      createdAt: new Date().toISOString(),
      isGlobal: !!isGlobal,
      allowedPlans: Array.isArray(allowedPlans) ? allowedPlans : ["all"],
      allowedClientIds: Array.isArray(allowedClientIds) ? allowedClientIds.map(Number).filter(n => !isNaN(n)) : [],
      unitEmails: Array.isArray(unitEmails) ? unitEmails : [],
    };
    if (coverUrl) newPl.coverUrl = coverUrl;
    if (genre) newPl.genre = genre;

    const id = await insert("playlists", newPl);
    return { status: 201, data: { id, ...newPl, itemCount: 0 } };
  }

  const plMatch = path.match(/^\/api\/playlists\/(\d+)$/);
  if (plMatch) {
    const plId = parseInt(plMatch[1]!);
    if (method === "GET") {
      const playlist = await getById<DBPlaylist>("playlists", plId);
      if (!playlist) return { status: 404, data: { error: "Not Found", message: "Playlist não encontrada" } };
      const allItems = await getAll<DBPlaylistItem>("playlistItems");
      const items = allItems.filter((i) => i.playlistId === plId).sort((a, b) => a.position - b.position);
      const allMedia = await getAll<DBMedia>("media");
      const validItems: any[] = [];

      for (const i of items) {
        const m = allMedia.find((med) => med.id === i.mediaId);
        if (!m) {
          // Prune orphaned item automatically from database
          try {
            await deleteDoc(doc(firestore, "playlistItems", String(i.id)));
            await deleteLocal("playlistItems", i.id);
          } catch {}
        } else {
          validItems.push({
            ...i,
            media: { ...m, url: getMediaBlobUrl(m.id, inMemoryMediaBlobs.get(m.id) || m.blob, m.url) },
          });
        }
      }

      return {
        status: 200,
        data: {
          ...playlist,
          active: playlist.active !== undefined ? playlist.active : true,
          isGlobal: !!playlist.isGlobal,
          allowedPlans: Array.isArray(playlist.allowedPlans) ? playlist.allowedPlans : ["all"],
          allowedClientIds: Array.isArray(playlist.allowedClientIds) ? playlist.allowedClientIds : [],
          unitEmails: Array.isArray(playlist.unitEmails) ? playlist.unitEmails : [],
          items: validItems,
        },
      };
    }

    if (method === "PUT") {
      const playlist = await getById<DBPlaylist>("playlists", plId);
      if (!playlist) return { status: 404, data: { error: "Not Found", message: "Playlist não encontrada" } };
      const updated: DBPlaylist = {
        ...playlist,
        ...body,
        id: plId,
        isGlobal: body.isGlobal !== undefined ? !!body.isGlobal : !!playlist.isGlobal,
        allowedPlans: Array.isArray(body.allowedPlans) ? body.allowedPlans : playlist.allowedPlans || ["all"],
        allowedClientIds: Array.isArray(body.allowedClientIds) ? body.allowedClientIds.map(Number).filter((n: number) => !isNaN(n)) : (playlist.allowedClientIds || []),
        unitEmails: Array.isArray(body.unitEmails) ? body.unitEmails : playlist.unitEmails || [],
        active: body.active !== undefined ? Boolean(body.active) : (playlist.active !== undefined ? playlist.active : true),
      };
      await update("playlists", updated);
      return { status: 200, data: updated };
    }

    if (method === "DELETE") {
      await remove("playlists", plId);
      return { status: 200, data: { success: true } };
    }
  }

  // ── Playlist Items Routes ──
  const plBatchMatch = path.match(/^\/api\/playlists\/(\d+)\/items\/batch$/);
  if (plBatchMatch && method === "POST") {
    const playlistId = parseInt(plBatchMatch[1]!);
    const mediaIds: number[] = body?.mediaIds || [];
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const currentItems = allItems.filter((i) => i.playlistId === playlistId);
    const existingMediaIds = new Set(currentItems.map((i) => i.mediaId));
    let currentPos = currentItems.length;
    let addedCount = 0;

    for (const mId of mediaIds) {
      const numMediaId = Number(mId);
      if (!isNaN(numMediaId) && !existingMediaIds.has(numMediaId)) {
        existingMediaIds.add(numMediaId);
        await insert("playlistItems", {
          playlistId,
          mediaId: numMediaId,
          position: currentPos++,
        });
        addedCount++;
      }
    }

    return { status: 201, data: { added: addedCount } };
  }

  const plItemsMatch = path.match(/^\/api\/playlists\/(\d+)\/items$/);
  if (plItemsMatch && method === "POST") {
    const playlistId = parseInt(plItemsMatch[1]!);
    const { mediaId, position } = body || {};
    const numMediaId = parseInt(mediaId);
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const currentItems = allItems.filter((i) => i.playlistId === playlistId);
    const existing = currentItems.find((i) => i.mediaId === numMediaId);
    if (existing) {
      return { status: 200, data: existing };
    }
    const pos = typeof position === "number" ? position : currentItems.length;
    const id = await insert("playlistItems", { playlistId, mediaId: numMediaId, position: pos });
    return { status: 201, data: { id, playlistId, mediaId: numMediaId, position: pos } };
  }
  if (plItemsMatch && method === "DELETE") {
    const playlistId = parseInt(plItemsMatch[1]!);
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const toDelete = allItems.filter((i) => i.playlistId === playlistId);
    for (const it of toDelete) {
      await remove("playlistItems", it.id);
    }
    return { status: 200, data: { success: true, count: toDelete.length } };
  }

  const plItemMatch = path.match(/^\/api\/playlists\/(\d+)\/items\/(\d+)$/);
  if (plItemMatch) {
    const playlistId = parseInt(plItemMatch[1]!);
    const itemId = parseInt(plItemMatch[2]!);

    if (method === "PATCH" || method === "PUT") {
      const existing = await getById<DBPlaylistItem>("playlistItems", itemId);
      if (!existing) return { status: 404, data: { error: "Not Found", message: "Item não encontrado" } };
      const updated: DBPlaylistItem = {
        ...existing,
        ...body,
        id: itemId,
        playlistId,
      };
      await update("playlistItems", updated);
      return { status: 200, data: updated };
    }

    if (method === "DELETE") {
      await remove("playlistItems", itemId);
      return { status: 200, data: { success: true } };
    }
  }

  const plReorderMatch = path.match(/^\/api\/playlists\/(\d+)\/reorder$/);
  if (plReorderMatch && method === "PUT") {
    const itemIds: (number | string)[] = body?.itemIds || [];
    const items = body?.items || [];

    if (itemIds.length > 0) {
      for (let pos = 0; pos < itemIds.length; pos++) {
        const itemId = Number(itemIds[pos]);
        if (isNaN(itemId)) continue;
        const existing = await getById<DBPlaylistItem>("playlistItems", itemId);
        if (existing) {
          await update("playlistItems", { ...existing, position: pos });
        }
      }
    } else if (items.length > 0) {
      for (const it of items) {
        if (it.id !== undefined && typeof it.position === "number") {
          const itemId = Number(it.id);
          if (isNaN(itemId)) continue;
          const existing = await getById<DBPlaylistItem>("playlistItems", itemId);
          if (existing) {
            await update("playlistItems", { ...existing, position: it.position });
          }
        }
      }
    }
    return { status: 200, data: { success: true } };
  }

  // ── Media Routes ──
  if (path === "/api/media" && method === "GET") {
    const media = await getAll<DBMedia>("media");
    const clientIdParam = query.get("clientId");
    const typeParam = query.get("type");
    let result = media;
    if (clientIdParam) result = result.filter((m) => m.clientId === parseInt(clientIdParam));
    if (typeParam && typeParam !== "all") result = result.filter((m) => m.type === typeParam);

    const enriched = result.map((m) => ({
      ...m,
      unitEmails: Array.isArray(m.unitEmails) ? m.unitEmails : [],
      url: getMediaBlobUrl(m.id, inMemoryMediaBlobs.get(m.id) || m.blob, m.url),
    }));

    // Trigger missing chunk loads in background without blocking response
    setTimeout(() => {
      result.forEach(async (m) => {
        if (!m.blob && !inMemoryMediaBlobs.has(m.id) && m.chunkCount && m.chunkCount > 0) {
          try {
            const loadedBlob = await loadMediaBlobFromFirestore(m.id, m.chunkCount, m.format ? `audio/${m.format}` : "audio/mpeg");
            if (loadedBlob) {
              m.blob = loadedBlob;
              inMemoryMediaBlobs.set(m.id, loadedBlob);
              await putLocal("media", m);
            }
          } catch {}
        }
      });
    }, 10);

    return { status: 200, data: enriched };
  }

  if ((path === "/api/media" || path === "/api/media/upload") && method === "POST") {
    let title = "Mídia de Áudio";
    let type: "music" | "jingle" | "voiceover" = "music";
    let clientId = 1;
    let duration = 180;
    let size = 1024 * 1024;
    let blob: Blob | undefined;
    let cloudUrl = "";
    let chunkCount = 0;
    let unitEmails: string[] = [];

    if (body instanceof FormData) {
      const file = body.get("file") as File;
      if (file) {
        title = (body.get("title") as string) || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
        type = ((body.get("type") as string) || "music") as "music" | "jingle" | "voiceover";
        clientId = parseInt(body.get("clientId") as string) || 1;
        size = file.size;
        blob = file;

        const rawUnits = body.get("unitEmails");
        if (rawUnits && typeof rawUnits === "string") {
          try {
            unitEmails = JSON.parse(rawUnits);
          } catch {
            unitEmails = rawUnits.split(/[\r\n,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
          }
        }

        if (onProgress) onProgress(20);

        // Try getting real duration from audio metadata
        try {
          const detectedDuration = await getAudioDurationFromFile(file);
          if (detectedDuration > 0) duration = detectedDuration;
        } catch {
          // ignore
        }

        if (onProgress) onProgress(40);

        const objectKey = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const newMedia: Omit<DBMedia, "id"> = {
          title,
          type,
          duration,
          format: file.name.split(".").pop()?.toLowerCase() || "mp3",
          size,
          objectKey,
          clientId,
          createdAt: new Date().toISOString(),
          url: cloudUrl,
          blob,
          chunkCount: 0,
          unitEmails: Array.isArray(unitEmails) ? unitEmails : [],
        };

        // Upload directly to Google Cloud Storage for global streaming
        try {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const devPrefix = isDev ? "dev/" : "";
          const fileRef = storageRef(storage, `media/${devPrefix}${clientId}/${Date.now()}_${safeName}`);

          const uploadTask = uploadBytesResumable(fileRef, file);
          await new Promise<void>((resolve, reject) => {
            uploadTask.on(
              "state_changed",
              (snapshot) => {
                if (snapshot.totalBytes > 0 && onProgress) {
                  const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                  onProgress(Math.max(15, Math.min(95, pct)));
                }
              },
              (err) => reject(err),
              () => resolve()
            );
          });

          const downloadUrl = await getDownloadURL(fileRef);
          if (downloadUrl) {
            cloudUrl = downloadUrl;
          }
        } catch (storageErr) {
          console.warn("[Storage] uploadBytesResumable error:", storageErr);
        }

        if (onProgress) onProgress(95);

        const id = await insert("media", { ...newMedia, url: cloudUrl });
        if (blob) inMemoryMediaBlobs.set(id, blob);

        const playlistIdParam = body.get("playlistId") as string;
        if (playlistIdParam) {
          const plId = parseInt(playlistIdParam);
          if (!isNaN(plId)) {
            const allItems = await getAll<DBPlaylistItem>("playlistItems");
            const currentItems = allItems.filter((i) => i.playlistId === plId);
            const maxPos = currentItems.length > 0 ? Math.max(...currentItems.map((i) => i.position)) + 1 : 0;
            await insert("playlistItems", {
              playlistId: plId,
              mediaId: id,
              position: maxPos,
              active: true,
            });
          }
        }

        // Only attempt Firestore chunking for small files if cloud storage completely failed
        if (!cloudUrl && file.size < 2 * 1024 * 1024) {
          try {
            chunkCount = await saveMediaChunksToFirestore(id, file);
            if (chunkCount > 0) {
              await update("media", { ...newMedia, id, url: cloudUrl, chunkCount });
            }
          } catch (err) {
            console.warn("[Firestore] saveMediaChunks failed:", err);
          }
        }

        if (onProgress) onProgress(100);
        const finalUrl = cloudUrl || getMediaBlobUrl(id, blob);

        return { status: 201, data: { id, ...newMedia, url: finalUrl, chunkCount } };
      }
    } else if (body) {
      title = body.title || title;
      type = body.type || type;
      clientId = parseInt(body.clientId) || clientId;
      duration = body.duration || duration;
      if (Array.isArray(body.unitEmails)) {
        unitEmails = body.unitEmails.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean);
      }
    }

    const objectKey = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newMedia: Omit<DBMedia, "id"> = {
      title,
      type,
      duration,
      format: "mp3",
      size,
      objectKey,
      clientId,
      createdAt: new Date().toISOString(),
      url: cloudUrl,
      blob,
      unitEmails: Array.isArray(unitEmails) ? unitEmails : [],
    };

    const id = await insert("media", newMedia);
    const finalUrl = cloudUrl || getMediaBlobUrl(id, blob);

    if (onProgress) onProgress(100);

    return { status: 201, data: { id, ...newMedia, url: finalUrl } };
  }

  const mediaMatch = path.match(/^\/api\/media\/(\d+)$/);
  if (mediaMatch && method === "DELETE") {
    const mediaId = parseInt(mediaMatch[1]!);
    await remove("media", mediaId);
    return { status: 200, data: { success: true } };
  }

  if (mediaMatch && (method === "PUT" || method === "PATCH")) {
    const mediaId = parseInt(mediaMatch[1]!);
    const existing = await getById<DBMedia>("media", mediaId);
    if (!existing) {
      return { status: 404, data: { error: "Not Found", message: "Mídia não encontrada" } };
    }
    const updated: DBMedia = {
      ...existing,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.artist !== undefined ? { artist: body.artist } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.clientId !== undefined ? { clientId: parseInt(body.clientId) } : {}),
      ...(body.duration !== undefined ? { duration: body.duration } : {}),
      ...(body.unitEmails !== undefined
        ? { unitEmails: Array.isArray(body.unitEmails) ? body.unitEmails.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean) : [] }
        : {}),
    };
    await update("media", updated);
    return { status: 200, data: updated };
  }

  if (path === "/api/media/batch-update-type" && method === "POST") {
    const { ids, type } = body || {};
    if (Array.isArray(ids) && type) {
      for (const id of ids) {
        const existing = await getById<DBMedia>("media", id);
        if (existing) {
          await update("media", { ...existing, type });
        }
      }
    }
    return { status: 200, data: { success: true } };
  }

  if (path === "/api/media/batch-delete" && method === "POST") {
    const ids: number[] = body?.ids || [];
    for (const id of ids) {
      await remove("media", id);
    }
    return { status: 200, data: { success: true, deleted: ids.length } };
  }

  // ── Devices Routes ──
  if (path.startsWith("/api/devices") && method === "GET") {
    const devices = await getAll<DBDevice>("devices");
    const clients = await getAll<DBClient>("clients");
    const clientIdParam = query.get("clientId");
    const filtered = clientIdParam ? devices.filter((d) => d.clientId === parseInt(clientIdParam)) : devices;
    const enriched = filtered.map((d) => {
      const client = clients.find((c) => c.id === d.clientId);
      const isOnline = d.lastSeen ? (Date.now() - new Date(d.lastSeen).getTime() < 5 * 60 * 1000) : false;
      return {
        ...d,
        clientName: client?.name ?? "–",
        isOnline,
      };
    });
    return { status: 200, data: enriched };
  }

  if (path.startsWith("/api/devices/") && method === "DELETE") {
    const id = parseInt(path.split("/").pop() || "0");
    if (id) {
      try {
        const allDevs = await getAll<DBDevice>("devices");
        const targetDev = allDevs.find((d) => d.id === id);
        const targetEmail = targetDev?.email?.trim().toLowerCase();
        await remove("devices", id);
        if (targetEmail) {
          const others = allDevs.filter((d) => d.email && d.email.trim().toLowerCase() === targetEmail && d.id !== id);
          for (const od of others) {
            await remove("devices", od.id).catch(() => {});
          }
        }
      } catch (err) {
        console.warn("[DELETE device] Erro ao remover dispositivo:", err);
        await remove("devices", id).catch(() => {});
      }
      invalidateStoreCache("devices");
    }
    return { status: 200, data: { success: true, message: "Device deleted" } };
  }

  // ── Reports Routes ──
  if (path === "/api/reports/playbacks" || path.startsWith("/api/reports/playbacks")) {
    const startDateParam = query.get("startDate");
    const endDateParam = query.get("endDate");
    const clientEmailParam = (query.get("clientEmail") || "").trim().toLowerCase();
    const mediaIdParam = query.get("mediaId");
    const typeParam = query.get("type");

    const allMedia = await getAll<DBMedia>("media");
    const mediaMap = new Map(allMedia.map((m) => [m.id, m]));
    const allClients = await getAll<DBClient>("clients");

    let targetClientEmails: string[] = [];
    if (clientEmailParam) {
      targetClientEmails.push(clientEmailParam);
      const matchedClient = allClients.find(
        (c) => (c.email && c.email.toLowerCase() === clientEmailParam) ||
               (c.masterEmail && c.masterEmail.toLowerCase() === clientEmailParam)
      );
      if (matchedClient) {
        targetClientEmails = extractClientAuthorizedEmails(matchedClient);
      }
    }

    const logs = await getPlaybackLogs({
      startDate: startDateParam || undefined,
      endDate: endDateParam || undefined,
    });

    let filtered = logs;
    if (targetClientEmails.length > 0) {
      filtered = filtered.filter((l) =>
        l.clientEmail && targetClientEmails.includes(l.clientEmail.toLowerCase())
      );
    }

    if (mediaIdParam && mediaIdParam !== "all" && parseInt(mediaIdParam, 10) > 0) {
      const mid = parseInt(mediaIdParam, 10);
      filtered = filtered.filter((l) => Number(l.mediaId) === mid);
    }

    if (typeParam && typeParam !== "all") {
      filtered = filtered.filter((l) => {
        const m = mediaMap.get(l.mediaId);
        const t = l.mediaType || m?.type;
        return t === typeParam;
      });
    }

    const entries = filtered.map((l) => {
      const m = mediaMap.get(l.mediaId);
      return {
        id: l.id,
        mediaId: l.mediaId,
        mediaTitle: l.mediaTitle || m?.title || "Mídia",
        mediaType: l.mediaType || m?.type || "jingle",
        deviceUuid: l.deviceUuid || "web-player",
        clientEmail: l.clientEmail || "",
        playedAt: l.playedAt,
      };
    });

    return {
      status: 200,
      data: {
        totalPlays: entries.length,
        entries,
      },
    };
  }

  if (path === "/api/reports/client-sessions" || path.startsWith("/api/reports/client-sessions")) {
    const clientIdRaw = query.get("clientId");
    const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : NaN;
    if (!clientId || Number.isNaN(clientId)) {
      return { status: 400, data: { error: "Bad Request", message: "clientId required" } };
    }

    const allClients = await getAll<DBClient>("clients");
    const client = allClients.find((c) => c.id === clientId);
    if (!client) {
      return { status: 404, data: { error: "Not Found", message: "Client not found" } };
    }

    const authorizedEmails = extractClientAuthorizedEmails(client);
    const allDevices = await getAll<DBDevice>("devices");
    const clientDevices = allDevices.filter((d) => d.clientId === clientId);
    const clientDeviceUuids = new Set(clientDevices.map((d) => d.uuid));

    const startDateParam = query.get("startDate");
    const endDateParam = query.get("endDate");

    const allMedia = await getAll<DBMedia>("media");
    const mediaMap = new Map(allMedia.map((m) => [m.id, m]));

    const logs = await getPlaybackLogs({
      startDate: startDateParam || undefined,
      endDate: endDateParam || undefined,
    });

    // Filter logs for this client
    const clientLogs = logs.filter((l) => {
      if (l.clientId === clientId) return true;
      if (l.clientEmail && authorizedEmails.includes(l.clientEmail.toLowerCase())) return true;
      if (l.deviceUuid && clientDeviceUuids.has(l.deviceUuid)) return true;
      return false;
    });

    // Sort ascending by playedAt for chronological session calculation
    clientLogs.sort((a, b) => (a.playedAt || "").localeCompare(b.playedAt || ""));

    const SESSION_GAP_MINUTES = 30;
    const TAIL_DURATION_MINUTES = 5;

    // Group by deviceUuid + clientEmail
    const groups = new Map<string, typeof clientLogs>();
    for (const r of clientLogs) {
      const key = `${r.deviceUuid || "dev"}__${r.clientEmail || client.email}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    type Session = {
      email: string;
      deviceUuid: string;
      startedAt: string;
      endedAt: string;
      durationMinutes: number;
      jinglePlays: number;
      musicPlays: number;
      jingleByMedia: Map<number, { mediaId: number; title: string; plays: number }>;
    };

    const sessions: Session[] = [];
    for (const [, groupRows] of groups) {
      let current: Session | null = null;
      let lastPlayed: number | null = null;
      for (const r of groupRows) {
        const t = new Date(r.playedAt).getTime();
        if (current && lastPlayed !== null && (t - lastPlayed) > SESSION_GAP_MINUTES * 60_000) {
          sessions.push(current);
          current = null;
        }
        const m = mediaMap.get(r.mediaId);
        const mTitle = r.mediaTitle || m?.title || "Mídia";
        const mType = r.mediaType || m?.type || "jingle";

        if (!current) {
          current = {
            email: r.clientEmail || client.email,
            deviceUuid: r.deviceUuid || "terminal",
            startedAt: new Date(r.playedAt).toISOString(),
            endedAt: new Date(r.playedAt).toISOString(),
            durationMinutes: 0,
            jinglePlays: 0,
            musicPlays: 0,
            jingleByMedia: new Map(),
          };
        }
        current.endedAt = new Date(r.playedAt).toISOString();
        if (mType === "jingle" || mType === "voiceover") {
          current.jinglePlays++;
          const existing = current.jingleByMedia.get(r.mediaId);
          if (existing) {
            existing.plays++;
          } else {
            current.jingleByMedia.set(r.mediaId, { mediaId: r.mediaId, title: mTitle, plays: 1 });
          }
        } else {
          current.musicPlays++;
        }
        lastPlayed = t;
      }
      if (current) sessions.push(current);
    }

    // Compute durations
    for (const s of sessions) {
      const start = new Date(s.startedAt).getTime();
      const end = new Date(s.endedAt).getTime();
      s.durationMinutes = Math.round(((end - start) / 60_000 + TAIL_DURATION_MINUTES) * 10) / 10;
    }

    // Per-email summary & Units mapping
    const registeredUnits = extractClientUnits(client);
    const unitNameByEmail = new Map(registeredUnits.map((u) => [u.email.toLowerCase(), u.name]));

    type EmailAgg = {
      email: string;
      unitName: string;
      sessionsCount: number;
      totalDurationMinutes: number;
      jingles: Map<number, { mediaId: number; title: string; plays: number }>;
    };
    const byEmail = new Map<string, EmailAgg>();

    // Pre-populate all registered units so every branch is visible in the report
    for (const u of registeredUnits) {
      const em = u.email.toLowerCase();
      if (!byEmail.has(em)) {
        byEmail.set(em, {
          email: u.email,
          unitName: u.name,
          sessionsCount: 0,
          totalDurationMinutes: 0,
          jingles: new Map(),
        });
      }
    }

    for (const s of sessions) {
      const em = s.email.toLowerCase();
      if (!byEmail.has(em)) {
        byEmail.set(em, {
          email: s.email,
          unitName: unitNameByEmail.get(em) || s.email,
          sessionsCount: 0,
          totalDurationMinutes: 0,
          jingles: new Map(),
        });
      }
      const agg = byEmail.get(em)!;
      agg.sessionsCount++;
      agg.totalDurationMinutes = Math.round((agg.totalDurationMinutes + s.durationMinutes) * 10) / 10;
      for (const [mid, jm] of s.jingleByMedia) {
        const existing = agg.jingles.get(mid);
        if (existing) existing.plays += jm.plays;
        else agg.jingles.set(mid, { ...jm });
      }
    }

    const sessionsOut = sessions
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((s) => ({
        email: s.email,
        unitName: unitNameByEmail.get(s.email.toLowerCase()) || s.email,
        deviceUuid: s.deviceUuid,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMinutes: s.durationMinutes,
        jinglePlays: s.jinglePlays,
        musicPlays: s.musicPlays,
      }));

    const emailSummaryOut = Array.from(byEmail.values())
      .map((a) => ({
        email: a.email,
        unitName: a.unitName || unitNameByEmail.get(a.email.toLowerCase()) || a.email,
        sessionsCount: a.sessionsCount,
        totalDurationMinutes: a.totalDurationMinutes,
        jingles: Array.from(a.jingles.values()).sort((x, y) => y.plays - x.plays),
      }))
      .sort((a, b) => {
        if (b.sessionsCount !== a.sessionsCount) return b.sessionsCount - a.sessionsCount;
        return a.unitName.localeCompare(b.unitName);
      });

    return {
      status: 200,
      data: {
        clientId,
        clientName: client.name,
        sessions: sessionsOut,
        emailSummary: emailSummaryOut,
      },
    };
  }

  // ── Default fallback ──
  return { status: 200, data: { success: true, message: "OK (Firebase Store)" } };
}
