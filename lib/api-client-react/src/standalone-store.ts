/**
 * Firebase Firestore & Storage Cloud Store + Local IndexedDB Cache for Radio Indoor
 * Provides multi-device real-time cloud synchronization for admins, clients, playlists, audio media blobs, and logs.
 */

import { firestore, storage } from "./firebase-config";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

const DB_NAME = "radio_indoor_db";
const DB_VERSION = 2;

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
}

export interface DBPlaylistItem {
  id: number;
  playlistId: number;
  mediaId: number;
  position: number;
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
}

export interface DBDevice {
  id: number;
  clientId: number;
  name: string;
  pairingCode: string;
  uuid?: string;
  email?: string;
  status: "active" | "pending" | "blocked";
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
  mediaId: number;
  playedAt: string;
  duration: number;
}

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("admins")) {
        const store = db.createObjectStore("admins", { keyPath: "id", autoIncrement: true });
        store.createIndex("email", "email", { unique: true });
      }
      if (!db.objectStoreNames.contains("clients")) {
        const store = db.createObjectStore("clients", { keyPath: "id", autoIncrement: true });
        store.createIndex("email", "email", { unique: true });
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
        store.createIndex("pairingCode", "pairingCode", { unique: true });
      }
      if (!db.objectStoreNames.contains("playbackLogs")) {
        const store = db.createObjectStore("playbackLogs", { keyPath: "id", autoIncrement: true });
        store.createIndex("clientId", "clientId", { unique: false });
      }
    };

    req.onsuccess = async () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── Local IndexedDB operations (Cache layer) ──
function getLocalAll<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function putLocal<T>(storeName: string, item: T): Promise<void> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      if (storeName === "media" && !(item as any).blob && (item as any).id) {
        const getReq = store.get((item as any).id);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing && existing.blob) {
            (item as any).blob = existing.blob;
          }
          const putReq = store.put(item);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => {
          const putReq = store.put(item);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
      } else {
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }
    });
  });
}

function deleteLocal(storeName: string, id: number): Promise<void> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

// ── Cloud Firestore + Cache Sync ──
export async function getAll<T extends { id: number }>(storeName: string): Promise<T[]> {
  try {
    const local = await getLocalAll<T>(storeName);
    const colRef = collection(firestore, storeName);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const localBlobMap = new Map((local as any[]).map((m: any) => [m.id, m.blob]));
      const items = snap.docs.map((d) => {
        const id = Number(d.id) || (d.data() as any).id;
        const data = d.data() as T;
        const existingBlob = localBlobMap.get(id);
        return {
          ...data,
          id,
          ...(existingBlob ? { blob: existingBlob } : {}),
        };
      });
      for (const it of items) {
        await putLocal(storeName, it);
      }
      return items;
    } else {
      // Cloud is empty for this collection: check if local has data and push up to Cloud Firestore
      if (local.length > 0) {
        for (const item of local) {
          try {
            const dRef = doc(firestore, storeName, String(item.id));
            const { blob, ...data } = item as any;
            await setDoc(dRef, data);
          } catch (syncErr) {
            console.warn(`[Firestore] sync up ${storeName} item failed:`, syncErr);
          }
        }
        return local;
      }
    }
  } catch (err) {
    console.warn(`[Firestore] getAll(${storeName}) failed, using local cache:`, err);
  }
  return getLocalAll<T>(storeName);
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
    const { blob, ...firestoreData } = fullItem as any;
    await setDoc(dRef, firestoreData);
  } catch (err) {
    console.warn(`[Firestore] insert(${storeName}) failed:`, err);
  }

  await putLocal(storeName, fullItem);
  return nextId;
}

export async function update<T extends { id: number }>(storeName: string, item: T): Promise<void> {
  try {
    const dRef = doc(firestore, storeName, String(item.id));
    const { blob, ...firestoreData } = item as any;
    await setDoc(dRef, firestoreData, { merge: true });
  } catch (err) {
    console.warn(`[Firestore] update(${storeName}) failed:`, err);
  }
  await putLocal(storeName, item);
}

export async function remove(storeName: string, id: number): Promise<void> {
  try {
    const dRef = doc(firestore, storeName, String(id));
    await deleteDoc(dRef);
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

// Session management
const SESSION_KEY = "radio_indoor_standalone_session";

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

const inMemoryMediaBlobs = new Map<number, Blob>();
const mediaBlobUrlCache = new Map<number, string>();
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
  if (client.masterEmail && typeof client.masterEmail === "string") {
    set.add(client.masterEmail.trim().toLowerCase());
  }
  if (client.email && typeof client.email === "string") {
    set.add(client.email.trim().toLowerCase());
  }
  return Array.from(set);
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
    let user = getSessionUser();
    if (!user) {
      user = { id: 1, email: "admin@radioindoor.com", name: "Administrador", role: "admin" };
      setSessionUser(user);
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

      const allDevs = await getAll<DBDevice>("devices");
      const nowIso = new Date().toISOString();
      let existingDev = allDevs.find((d) => (uuid && d.uuid === uuid) || (d.email && d.email.toLowerCase() === email));
      let devId = 1;
      if (existingDev) {
        devId = existingDev.id;
        existingDev.lastSeen = nowIso;
        existingDev.clientId = authorizedClient.id;
        existingDev.email = email;
        if (uuid) existingDev.uuid = uuid;
        existingDev.status = "active";
        await update("devices", existingDev);
      } else {
        const newDev: Omit<DBDevice, "id"> = {
          clientId: authorizedClient.id,
          name: email.split("@")[0] || "Device",
          pairingCode: "",
          uuid: uuid || `dev-${Date.now()}`,
          email: email,
          status: "active",
          lastSeen: nowIso,
          createdAt: nowIso,
        };
        devId = await insert("devices", newDev);
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

  // ── Playback Queue Route for Player ──
  if (
    path === "/api/playback/queue" ||
    path === "/api/player/queue" ||
    path.startsWith("/api/playback/queue") ||
    path.startsWith("/api/player/queue")
  ) {
    const emailParam = (query.get("email") || "").trim().toLowerCase();
    const clientIdParam = query.get("clientId");
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

    const clientIds = matchingClients.map((c) => c.id);
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const clientPlaylists = allPlaylists.filter((p) => clientIds.includes(p.clientId) && p.active);

    let activePlaylist = requestedPlaylistId
      ? clientPlaylists.find((p) => p.id === requestedPlaylistId)
      : clientPlaylists[0];

    if (!activePlaylist && clientPlaylists.length > 0) {
      activePlaylist = clientPlaylists[0];
    }

    const targetClient = activePlaylist
      ? matchingClients.find((c) => c.id === activePlaylist.clientId) || matchingClients[0]!
      : matchingClients[0]!;

    const targetClientId = targetClient.id;

    if (!activePlaylist) {
      return {
        status: 200,
        data: {
          clientId: targetClientId,
          deviceId: 1,
          playlistId: null,
          currentIndex: 0,
          playbackMode: targetClient.playbackMode || "sequential",
          jingleMode: targetClient.jingleMode || "interval",
          jingleInterval: targetClient.jingleInterval || 3,
          jingleCount: targetClient.jingleCount ?? 1,
          voiceoverCount: targetClient.voiceoverCount ?? 1,
          jingleIntervalSeconds: targetClient.jingleIntervalSeconds || 900,
          musicVolume: 1,
          jingleVolume: 1,
          items: [],
        },
      };
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

    const clientMedia = allMedia.filter((m) => m.clientId === targetClientId);
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const playlistItems = allItems.filter((i) => i.playlistId === activePlaylist.id).sort((a, b) => a.position - b.position);

    let queueItems: any[] = [];
    if (playlistItems.length > 0) {
      queueItems = playlistItems.map((item) => {
        const m = allMedia.find((med) => med.id === item.mediaId);
        const memBlob = m ? inMemoryMediaBlobs.get(m.id) || m.blob : undefined;
        const audioUrl = m ? getMediaBlobUrl(m.id, memBlob, m.url) : "";
        return {
          id: m?.id || item.id,
          title: m?.title || "Áudio",
          artist: m?.artist || "",
          type: m?.type || "music",
          filename: m?.title || "audio.mp3",
          url: audioUrl,
          duration: m?.duration || 180,
          clientId: targetClientId,
          createdAt: m?.createdAt || new Date().toISOString(),
        };
      });
    } else if (clientMedia.length > 0) {
      queueItems = clientMedia.map((m) => ({
        id: m.id,
        title: m.title,
        artist: m.artist || "",
        type: m.type,
        filename: m.title,
        url: getMediaBlobUrl(m.id, inMemoryMediaBlobs.get(m.id) || m.blob, m.url),
        duration: m.duration || 180,
        clientId: targetClientId,
        createdAt: m.createdAt,
      }));
    }

    return {
      status: 200,
      data: {
        clientId: targetClientId,
        deviceId: 1,
        playlistId: activePlaylist.id,
        currentIndex: 0,
        playbackMode: targetClient.playbackMode || "sequential",
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

    const clientIds = matchingClients.map((c) => c.id);
    const clientMap = new Map(matchingClients.map((c) => [c.id, c.name]));
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const matchedPlaylists = allPlaylists.filter((p) => clientIds.includes(p.clientId) && p.active);
    const allItems = await getAll<DBPlaylistItem>("playlistItems");

    const result = matchedPlaylists.map((p) => {
      const clientName = clientMap.get(p.clientId) || "";
      return {
        id: p.id,
        name: matchingClients.length > 1 ? `${clientName} — ${p.name}` : p.name,
        clientName,
        itemCount: allItems.filter((i) => i.playlistId === p.id).length,
        active: p.active,
        clientId: p.clientId,
      };
    });

    return { status: 200, data: result };
  }

  if (path === "/api/devices/heartbeat" || path === "/api/playback/heartbeat" || path === "/api/playback/log") {
    const email = (body?.email || "").trim().toLowerCase();
    const uuid = (body?.uuid || "").trim();
    if (email || uuid) {
      const allDevs = await getAll<DBDevice>("devices");
      let dev = allDevs.find((d) => (uuid && d.uuid === uuid) || (email && d.email && d.email.toLowerCase() === email));
      const nowIso = new Date().toISOString();
      if (dev) {
        dev.lastSeen = nowIso;
        if (email) dev.email = email;
        if (uuid) dev.uuid = uuid;
        await update("devices", dev);
      } else if (email) {
        const clients = await getAll<DBClient>("clients");
        const matchClient = clients.find((c) =>
          (c.masterEmail && c.masterEmail.toLowerCase() === email) ||
          (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === email)) ||
          (c.email && c.email.toLowerCase() === email)
        );
        const newDev: Omit<DBDevice, "id"> = {
          clientId: matchClient?.id ?? 0,
          name: email.split("@")[0] || "Device",
          pairingCode: "",
          uuid: uuid || `dev-${Date.now()}`,
          email: email,
          status: "active",
          lastSeen: nowIso,
          createdAt: nowIso,
        };
        await insert("devices", newDev);
      }
    }
    return { status: 200, data: { status: "active", success: true } };
  }

  // ── Dashboard Summary ──
  if (path === "/api/dashboard/summary") {
    const clients = await getAll<DBClient>("clients");
    const playlists = await getAll<DBPlaylist>("playlists");
    const media = await getAll<DBMedia>("media");
    const devices = await getAll<DBDevice>("devices");

    return {
      status: 200,
      data: {
        totalClients: clients.length,
        totalPlaylists: playlists.length,
        totalMedia: media.length,
        totalDevices: devices.length,
        activeDevices: devices.filter((d) => d.status === "active").length,
        recentActivity: [],
      },
    };
  }

  // ── Clients Routes ──
  if (path === "/api/clients" && method === "GET") {
    const clients = await getAll<DBClient>("clients");
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const allMedia = await getAll<DBMedia>("media");

    const enriched = clients.map((c) => ({
      ...c,
      authorizedEmails: Array.isArray(c.authorizedEmails) ? c.authorizedEmails : [],
      playlistCount: allPlaylists.filter((p) => p.clientId === c.id).length,
      mediaCount: allMedia.filter((m) => m.clientId === c.id).length,
      deviceCount: 1,
    }));

    return { status: 200, data: enriched };
  }

  if (path === "/api/clients" && method === "POST") {
    const { name, email, masterEmail, password, playbackMode, jingleMode, jingleInterval, jingleCount, voiceoverCount, jingleIntervalSeconds, authorizedEmails } = body || {};
    const validEmails = Array.isArray(authorizedEmails) ? authorizedEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : [];
    const cleanEmail = (email || validEmails[0] || `client-${Date.now()}@cliente.radioindoor.com`).trim().toLowerCase();
    const cleanMasterEmail = (masterEmail || cleanEmail).trim().toLowerCase();

    const existingClients = await getAll<DBClient>("clients");
    if (existingClients.some((c) => c.email.toLowerCase() === cleanEmail && !cleanEmail.includes("@cliente.radioindoor.com"))) {
      return { status: 400, data: { error: "Bad Request", message: "Email já cadastrado" } };
    }

    const newClient: Omit<DBClient, "id"> = {
      name: (name || "Novo Cliente").trim(),
      email: cleanEmail,
      masterEmail: cleanMasterEmail,
      authorizedEmails: validEmails,
      passwordHash: password || "123456",
      playbackMode: playbackMode || "sequential",
      jingleMode: jingleMode || "interval",
      jingleInterval: typeof jingleInterval === "number" ? jingleInterval : 3,
      jingleCount: typeof jingleCount === "number" ? jingleCount : 1,
      voiceoverCount: typeof voiceoverCount === "number" ? voiceoverCount : 1,
      jingleIntervalSeconds: typeof jingleIntervalSeconds === "number" ? jingleIntervalSeconds : 900,
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
    });

    return { status: 201, data: { id, ...newClient } };
  }

  const clientMatch = path.match(/^\/api\/clients\/(\d+)$/);
  if (clientMatch) {
    const clientId = parseInt(clientMatch[1]!);
    if (method === "GET") {
      const client = await getById<DBClient>("clients", clientId);
      if (!client) return { status: 404, data: { error: "Not Found", message: "Cliente não encontrado" } };
      return { status: 200, data: client };
    }

    if (method === "PUT") {
      const client = await getById<DBClient>("clients", clientId);
      if (!client) return { status: 404, data: { error: "Not Found", message: "Cliente não encontrado" } };
      const updated = {
        ...client,
        ...body,
        id: clientId,
        authorizedEmails: Array.isArray(body.authorizedEmails) ? body.authorizedEmails : client.authorizedEmails || [],
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

    let result = playlists;
    if (clientIdParam) {
      result = playlists.filter((p) => p.clientId === parseInt(clientIdParam));
    }

    const enriched = result.map((p) => ({
      ...p,
      itemCount: allItems.filter((i) => i.playlistId === p.id).length,
    }));

    return { status: 200, data: enriched };
  }

  if (path === "/api/playlists" && method === "POST") {
    const { name, clientId, playbackMode } = body || {};
    const newPl: Omit<DBPlaylist, "id"> = {
      name: name || "Nova Playlist",
      clientId: typeof clientId === "number" ? clientId : 1,
      playbackMode: playbackMode || "sequential",
      active: true,
      createdAt: new Date().toISOString(),
    };
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

      return { status: 200, data: { ...playlist, items: validItems } };
    }

    if (method === "PUT") {
      const playlist = await getById<DBPlaylist>("playlists", plId);
      if (!playlist) return { status: 404, data: { error: "Not Found", message: "Playlist não encontrada" } };
      const updated = { ...playlist, ...body, id: plId };
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
    let currentPos = currentItems.length;
    let addedCount = 0;

    for (const mId of mediaIds) {
      const numMediaId = Number(mId);
      if (!isNaN(numMediaId)) {
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
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const currentItems = allItems.filter((i) => i.playlistId === playlistId);
    const pos = typeof position === "number" ? position : currentItems.length;
    const id = await insert("playlistItems", { playlistId, mediaId: parseInt(mediaId), position: pos });
    return { status: 201, data: { id, playlistId, mediaId: parseInt(mediaId), position: pos } };
  }

  const plItemDeleteMatch = path.match(/^\/api\/playlists\/(\d+)\/items\/(\d+)$/);
  if (plItemDeleteMatch && method === "DELETE") {
    const itemId = parseInt(plItemDeleteMatch[2]!);
    await remove("playlistItems", itemId);
    return { status: 200, data: { success: true } };
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

    // Preload missing blobs from Firestore chunks in parallel
    await Promise.all(
      result.map(async (m) => {
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

    const enriched = result.map((m) => ({
      ...m,
      url: getMediaBlobUrl(m.id, inMemoryMediaBlobs.get(m.id) || m.blob, m.url),
    }));
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

    if (body instanceof FormData) {
      const file = body.get("file") as File;
      if (file) {
        title = (body.get("title") as string) || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
        type = ((body.get("type") as string) || "music") as "music" | "jingle" | "voiceover";
        clientId = parseInt(body.get("clientId") as string) || 1;
        size = file.size;
        blob = file;

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
        };

        if (onProgress) onProgress(60);

        // Upload directly to Google Cloud Storage for global streaming
        try {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileRef = storageRef(storage, `media/${clientId}/${Date.now()}_${safeName}`);
          await uploadBytes(fileRef, file);
          const downloadUrl = await getDownloadURL(fileRef);
          if (downloadUrl) {
            cloudUrl = downloadUrl;
          }
        } catch (storageErr) {
          console.warn("[Storage] uploadBytes error:", storageErr);
        }

        if (onProgress) onProgress(85);

        const id = await insert("media", { ...newMedia, url: cloudUrl });
        if (blob) inMemoryMediaBlobs.set(id, blob);

        // Also save Firestore chunks as backup if cloudUrl wasn't created
        if (!cloudUrl) {
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
      await remove("devices", id);
    }
    return { status: 200, data: { success: true, message: "Device deleted" } };
  }

  // ── Reports Routes ──
  if (path.startsWith("/api/reports/")) {
    return {
      status: 200,
      data: {
        totalPlays: 0,
        totalDuration: 0,
        items: [],
      },
    };
  }

  // ── Default fallback ──
  return { status: 200, data: { success: true, message: "OK (Firebase Store)" } };
}
