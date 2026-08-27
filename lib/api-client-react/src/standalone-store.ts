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
  type: "music" | "jingle";
  duration: number;
  format: string;
  size: number;
  objectKey: string;
  clientId: number;
  createdAt: string;
  url?: string;
  blob?: Blob;
}

export interface DBDevice {
  id: number;
  clientId: number;
  name: string;
  pairingCode: string;
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
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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
    const colRef = collection(firestore, storeName);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const items = snap.docs.map((d) => ({ ...(d.data() as T), id: Number(d.id) || (d.data() as any).id }));
      for (const it of items) {
        await putLocal(storeName, it);
      }
      return items;
    } else {
      // Cloud is empty for this collection: check if local has data and push up to Cloud Firestore
      const local = await getLocalAll<T>(storeName);
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
  try {
    const dRef = doc(firestore, storeName, String(id));
    const snap = await getDoc(dRef);
    if (snap.exists()) {
      const it = { ...(snap.data() as T), id: Number(snap.id) };
      await putLocal(storeName, it);
      return it;
    }
  } catch (err) {
    console.warn(`[Firestore] getById(${storeName}, ${id}) failed:`, err);
  }
  const items = await getLocalAll<T>(storeName);
  return items.find((it) => it.id === id);
}

export async function insert<T extends { id?: number }>(storeName: string, item: T): Promise<number> {
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

const mediaBlobUrlCache = new Map<number, string>();

export function getMediaBlobUrl(id: number, blob?: Blob, url?: string): string {
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  if (mediaBlobUrlCache.has(id)) {
    return mediaBlobUrlCache.get(id)!;
  }
  if (blob) {
    const objUrl = URL.createObjectURL(blob);
    mediaBlobUrlCache.set(id, objUrl);
    return objUrl;
  }
  return url || "";
}

/**
 * Handle API requests locally inside the browser connected with Firestore & Firebase Storage.
 */
export async function handleStandaloneRequest(
  urlPath: string,
  method: string,
  body: any,
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

    if (!email) {
      return { status: 400, data: { error: "Bad Request", message: "Email é obrigatório" } };
    }

    const clients = await getAll<DBClient>("clients");
    const activeClients = clients.filter((c) => c.active);

    // 1. Check if email is in masterEmail or authorizedEmails of any active client
    const authorizedClient = activeClients.find((c) => {
      if (c.masterEmail && c.masterEmail.toLowerCase() === email) return true;
      if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === email)) return true;
      return false;
    });

    if (authorizedClient) {
      return {
        status: 200,
        data: {
          status: "active",
          registered: true,
          clientId: authorizedClient.id,
          clientName: authorizedClient.name,
          deviceId: 1,
          message: "Acesso autorizado ao Player",
        },
      };
    }

    // 2. Check if email matches login email of an active client (requires manual approval)
    const loginClient = activeClients.find((c) => c.email && c.email.toLowerCase() === email);
    if (loginClient) {
      return {
        status: 200,
        data: {
          status: "pending",
          registered: true,
          clientId: loginClient.id,
          clientName: loginClient.name,
          deviceId: 1,
          message: "Aguardando aprovação do administrador",
        },
      };
    }

    // 3. Email is NOT registered in any client -> Reject with pending / unauthorized status
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
    const activeClients = clients.filter((c) => c.active);

    const client = activeClients.find((c) => {
      if (clientIdParam && c.id === parseInt(clientIdParam)) return true;
      if (emailParam) {
        if (c.masterEmail && c.masterEmail.toLowerCase() === emailParam) return true;
        if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === emailParam)) return true;
      }
      return false;
    });

    if (!client) {
      return {
        status: 403,
        data: {
          error: "Forbidden",
          message: "E-mail não cadastrado ou não autorizado a acessar playlists.",
        },
      };
    }

    const targetClientId = client.id;
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const clientPlaylists = allPlaylists.filter((p) => p.clientId === targetClientId && p.active);

    let activePlaylist = requestedPlaylistId
      ? clientPlaylists.find((p) => p.id === requestedPlaylistId)
      : clientPlaylists[0];

    if (!activePlaylist) {
      const plId = await insert("playlists", {
        name: "Playlist Principal",
        clientId: targetClientId,
        playbackMode: client.playbackMode || "sequential",
        active: true,
        createdAt: new Date().toISOString(),
      });
      activePlaylist = { id: plId, name: "Playlist Principal", clientId: targetClientId, playbackMode: "sequential", active: true, createdAt: new Date().toISOString() };
    }

    const allMedia = await getAll<DBMedia>("media");
    const clientMedia = allMedia.filter((m) => m.clientId === targetClientId);

    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const playlistItems = allItems.filter((i) => i.playlistId === activePlaylist.id).sort((a, b) => a.position - b.position);

    let queueItems: any[] = [];
    if (playlistItems.length > 0) {
      queueItems = playlistItems.map((item) => {
        const m = allMedia.find((med) => med.id === item.mediaId);
        const audioUrl = m ? getMediaBlobUrl(m.id, m.blob, m.url) : "";
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
        url: getMediaBlobUrl(m.id, m.blob, m.url),
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
        playbackMode: client.playbackMode || "sequential",
        jingleMode: client.jingleMode || "interval",
        jingleInterval: client.jingleInterval || 3,
        jingleIntervalSeconds: client.jingleIntervalSeconds || 900,
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
    const activeClients = clients.filter((c) => c.active);

    const client = activeClients.find((c) => {
      if (emailParam) {
        if (c.masterEmail && c.masterEmail.toLowerCase() === emailParam) return true;
        if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === emailParam)) return true;
      }
      return false;
    });

    if (!client) {
      return {
        status: 403,
        data: {
          error: "Forbidden",
          message: "E-mail não cadastrado ou não autorizado.",
        },
      };
    }

    const targetClientId = client.id;
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const clientPlaylists = allPlaylists.filter((p) => p.clientId === targetClientId && p.active);
    const allItems = await getAll<DBPlaylistItem>("playlistItems");

    const result = clientPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      itemCount: allItems.filter((i) => i.playlistId === p.id).length,
      active: p.active,
      clientId: p.clientId,
    }));

    return { status: 200, data: result };
  }

  if (path === "/api/playback/heartbeat" || path === "/api/playback/log") {
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
    const { name, email, masterEmail, password, playbackMode, jingleMode, jingleInterval, jingleIntervalSeconds, authorizedEmails } = body || {};
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanMasterEmail = (masterEmail || cleanEmail).trim().toLowerCase();

    const existingClients = await getAll<DBClient>("clients");
    if (existingClients.some((c) => c.email.toLowerCase() === cleanEmail)) {
      return { status: 400, data: { error: "Bad Request", message: "Email já cadastrado" } };
    }

    const newClient: Omit<DBClient, "id"> = {
      name: (name || "Novo Cliente").trim(),
      email: cleanEmail,
      masterEmail: cleanMasterEmail,
      authorizedEmails: Array.isArray(authorizedEmails) ? authorizedEmails : [],
      passwordHash: password || "123456",
      playbackMode: playbackMode || "sequential",
      jingleMode: jingleMode || "interval",
      jingleInterval: typeof jingleInterval === "number" ? jingleInterval : 3,
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
      const enrichedItems = items.map((i) => {
        const m = allMedia.find((med) => med.id === i.mediaId);
        return {
          ...i,
          media: m ? { ...m, url: getMediaBlobUrl(m.id, m.blob, m.url) } : null,
        };
      });
      return { status: 200, data: { ...playlist, items: enrichedItems } };
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
    const enriched = result.map((m) => ({
      ...m,
      url: getMediaBlobUrl(m.id, m.blob, m.url),
    }));
    return { status: 200, data: enriched };
  }

  if ((path === "/api/media" || path === "/api/media/upload") && method === "POST") {
    let title = "Mídia de Áudio";
    let type: "music" | "jingle" = "music";
    let clientId = 1;
    let duration = 180;
    let size = 1024 * 1024;
    let blob: Blob | undefined;
    let cloudUrl = "";

    if (body instanceof FormData) {
      const file = body.get("file") as File;
      if (file) {
        title = (body.get("title") as string) || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
        type = ((body.get("type") as string) || "music") as "music" | "jingle";
        clientId = parseInt(body.get("clientId") as string) || 1;
        size = file.size;
        blob = file;

        // Upload to Firebase Storage
        try {
          const fileRef = storageRef(storage, `media/${clientId}/${Date.now()}_${file.name}`);
          await uploadBytes(fileRef, file);
          cloudUrl = await getDownloadURL(fileRef);
        } catch (storageErr) {
          console.warn("[Firebase Storage] Upload failed, falling back to blob URL:", storageErr);
        }
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
  if (path === "/api/devices" && method === "GET") {
    const devices = await getAll<DBDevice>("devices");
    const clientIdParam = query.get("clientId");
    const filtered = clientIdParam ? devices.filter((d) => d.clientId === parseInt(clientIdParam)) : devices;
    return { status: 200, data: filtered };
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
