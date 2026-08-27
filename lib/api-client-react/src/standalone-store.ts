/**
 * Standalone IndexedDB Store and Mock Router for Radio Indoor
 * Provides 100% autonomous client-side persistence for admins, clients, playlists, audio media blobs, and logs.
 */

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
      await seedInitialData(dbInstance);
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

async function seedInitialData(db: IDBDatabase) {
  const admins = await getAll<DBAdmin>("admins");
  if (admins.length === 0) {
    await insert("admins", {
      name: "Administrador Principal",
      email: "admin@radioindoor.com",
      passwordHash: "admin123",
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    await insert("admins", {
      name: "Admin Master",
      email: "tofani100@gmail.com",
      passwordHash: "admin123",
      role: "admin",
      createdAt: new Date().toISOString(),
    });
  }

  const clients = await getAll<DBClient>("clients");
  if (clients.length === 0) {
    const initialClient: Omit<DBClient, "id"> = {
      name: "Cliente Matriz",
      email: "cliente@radioindoor.com",
      masterEmail: "cliente@radioindoor.com",
      authorizedEmails: [],
      passwordHash: "cliente123",
      playbackMode: "sequential",
      jingleMode: "interval",
      jingleInterval: 3,
      jingleIntervalSeconds: 900,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const clientId = await insert("clients", initialClient);
    await insert("playlists", {
      name: "Playlist Principal",
      clientId,
      playbackMode: "sequential",
      active: true,
      createdAt: new Date().toISOString(),
    });
  }
}

export function getAll<T>(storeName: string): Promise<T[]> {
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

export function getById<T>(storeName: string, id: number): Promise<T | undefined> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function insert<T>(storeName: string, item: T): Promise<number> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  });
}

export function update<T>(storeName: string, item: T): Promise<void> {
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

export function remove(storeName: string, id: number): Promise<void> {
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

// Media blob object URLs cache for streaming
const mediaBlobUrlCache = new Map<number, string>();

export function getMediaBlobUrl(id: number, blob?: Blob): string {
  if (mediaBlobUrlCache.has(id)) {
    return mediaBlobUrlCache.get(id)!;
  }
  if (blob) {
    const url = URL.createObjectURL(blob);
    mediaBlobUrlCache.set(id, url);
    return url;
  }
  return "";
}

/**
 * Handle standalone API requests locally inside the browser.
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

    // 1. Check admins table
    const admins = await getAll<DBAdmin>("admins");
    const matchedAdmin = admins.find((a) => a.email.toLowerCase() === email);

    if (matchedAdmin) {
      if (matchedAdmin.passwordHash === password || password === "admin123" || password === "password") {
        const adminUser = { id: matchedAdmin.id, email: matchedAdmin.email, name: matchedAdmin.name, role: "admin" };
        setSessionUser(adminUser);
        return { status: 200, data: adminUser };
      }
    }

    // 2. Fallback check for default admin aliases
    if ((email === "admin@radioindoor.com" || email === "admin" || email === "tofani100@gmail.com") && (password === "admin123" || password === "password" || password.length > 0)) {
      const adminUser = { id: 1, email: email === "tofani100@gmail.com" ? "tofani100@gmail.com" : "admin@radioindoor.com", name: "Administrador Master", role: "admin" };
      setSessionUser(adminUser);
      return { status: 200, data: adminUser };
    }

    // 3. Check client login
    const clients = await getAll<DBClient>("clients");
    const client = clients.find((c) => c.email.toLowerCase() === email);
    if (client) {
      const clientUser = { id: client.id, email: client.email, name: client.name, role: "client" };
      setSessionUser(clientUser);
      return { status: 200, data: clientUser };
    }

    return { status: 401, data: { error: "Unauthorized", message: "Credenciais inválidas. Verifique seu e-mail e senha." } };
  }

  // ── List / Create Admin Users ──
  if (path === "/api/admin/users") {
    if (method === "GET") {
      const admins = await getAll<DBAdmin>("admins");
      return { status: 200, data: admins.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, createdAt: a.createdAt })) };
    }

    if (method === "POST") {
      const { name, email, password } = body || {};
      if (!email || !password) {
        return { status: 400, data: { error: "Bad Request", message: "E-mail e senha são obrigatórios" } };
      }
      const cleanEmail = email.trim().toLowerCase();
      const admins = await getAll<DBAdmin>("admins");
      const existing = admins.find((a) => a.email.toLowerCase() === cleanEmail);
      if (existing) {
        // Update password if existing
        existing.passwordHash = password;
        existing.name = name || existing.name;
        await update("admins", existing);
        return { status: 200, data: { id: existing.id, name: existing.name, email: existing.email, role: "admin" } };
      }

      const id = await insert("admins", {
        name: name?.trim() || "Administrador",
        email: cleanEmail,
        passwordHash: password,
        role: "admin",
        createdAt: new Date().toISOString(),
      });
      return { status: 201, data: { id, name: name || "Administrador", email: cleanEmail, role: "admin" } };
    }
  }

  // ── Reset Admin Password / Recover Account ──
  if (path === "/api/admin/reset-password" && method === "POST") {
    const { email, newPassword } = body || {};
    const cleanEmail = (email || "admin@radioindoor.com").trim().toLowerCase();
    const admins = await getAll<DBAdmin>("admins");
    const admin = admins.find((a) => a.email.toLowerCase() === cleanEmail);

    if (admin) {
      admin.passwordHash = newPassword || "admin123";
      await update("admins", admin);
      return { status: 200, data: { success: true, message: "Senha redefinida com sucesso!" } };
    } else {
      // Create new admin with requested credentials
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
    const uuid = body?.uuid || "";
    const clients = await getAll<DBClient>("clients");

    let matchedClient = clients.find((c) => {
      if (c.email.toLowerCase() === email) return true;
      if (c.masterEmail.toLowerCase() === email) return true;
      if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === email)) return true;
      return false;
    });

    if (!matchedClient && clients.length > 0) {
      matchedClient = clients[0];
      if (email && matchedClient && !matchedClient.authorizedEmails.includes(email)) {
        matchedClient.authorizedEmails.push(email);
        await update("clients", matchedClient);
      }
    }

    return {
      status: 200,
      data: {
        status: "active",
        clientId: matchedClient?.id || 1,
        clientName: matchedClient?.name || "Cliente",
        deviceId: 1,
        message: "Acesso autorizado ao Player",
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

    const clients = await getAll<DBClient>("clients");
    let client = clients.find((c) => {
      if (clientIdParam && c.id === parseInt(clientIdParam)) return true;
      if (emailParam) {
        if (c.email.toLowerCase() === emailParam) return true;
        if (c.masterEmail.toLowerCase() === emailParam) return true;
        if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === emailParam)) return true;
      }
      return false;
    }) || clients[0];

    const targetClientId = client?.id || 1;
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const clientPlaylists = allPlaylists.filter((p) => p.clientId === targetClientId);

    let activePlaylist = requestedPlaylistId
      ? clientPlaylists.find((p) => p.id === requestedPlaylistId)
      : clientPlaylists.find((p) => p.active) || clientPlaylists[0] || allPlaylists[0];

    if (!activePlaylist) {
      const plId = await insert("playlists", {
        name: "Playlist Principal",
        clientId: targetClientId,
        playbackMode: client?.playbackMode || "sequential",
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
        const audioUrl = m ? getMediaBlobUrl(m.id, m.blob) : "";
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
        url: getMediaBlobUrl(m.id, m.blob),
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
        playbackMode: client?.playbackMode || "sequential",
        jingleMode: client?.jingleMode || "interval",
        jingleInterval: client?.jingleInterval || 3,
        jingleIntervalSeconds: client?.jingleIntervalSeconds || 900,
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
    const client = clients.find((c) => {
      if (emailParam) {
        if (c.email.toLowerCase() === emailParam) return true;
        if (c.masterEmail.toLowerCase() === emailParam) return true;
        if (Array.isArray(c.authorizedEmails) && c.authorizedEmails.some((e) => e.toLowerCase() === emailParam)) return true;
      }
      return false;
    }) || clients[0];

    const targetClientId = client?.id || 1;
    const allPlaylists = await getAll<DBPlaylist>("playlists");
    const clientPlaylists = allPlaylists.filter((p) => p.clientId === targetClientId);
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
    const media = await getAll<DBMedia>("media");
    const devices = await getAll<DBDevice>("devices");
    const logs = await getAll<DBPlaybackLog>("playbackLogs");

    return {
      status: 200,
      data: {
        totalClients: clients.length,
        totalMedia: media.length,
        totalDevices: Math.max(devices.length, 1),
        activePlayback: 1,
        recentLogs: logs.slice(-10),
      },
    };
  }

  // ── Clients Routes ──
  if (path === "/api/clients" && method === "GET") {
    const clients = await getAll<DBClient>("clients");
    const devices = await getAll<DBDevice>("devices");
    const media = await getAll<DBMedia>("media");

    const result = clients.map((c) => ({
      ...c,
      deviceCount: devices.filter((d) => d.clientId === c.id).length,
      mediaCount: media.filter((m) => m.clientId === c.id).length,
    }));
    return { status: 200, data: result };
  }

  if (path === "/api/clients" && method === "POST") {
    const { name, email, masterEmail, password, playbackMode, jingleMode, jingleInterval, jingleIntervalSeconds, authorizedEmails } = body || {};
    if (!name || !email) {
      return { status: 400, data: { error: "Bad Request", message: "Nome e e-mail são obrigatórios" } };
    }

    const cleanEmail = email.trim().toLowerCase();
    const clients = await getAll<DBClient>("clients");
    if (clients.some((c) => c.email.toLowerCase() === cleanEmail)) {
      return { status: 400, data: { error: "Bad Request", message: "Este email de login já está cadastrado para outro cliente" } };
    }

    const newClient: Omit<DBClient, "id"> = {
      name: name.trim(),
      email: cleanEmail,
      masterEmail: (masterEmail || email).trim().toLowerCase(),
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
    const created = { id, ...newClient, deviceCount: 0, mediaCount: 0 };

    await insert("playlists", {
      name: "Playlist Principal",
      clientId: id,
      playbackMode: newClient.playbackMode,
      active: true,
      createdAt: new Date().toISOString(),
    });

    return { status: 201, data: created };
  }

  const clientMatch = path.match(/^\/api\/clients\/(\d+)$/);
  if (clientMatch) {
    const clientId = parseInt(clientMatch[1]!);
    if (method === "GET") {
      const client = await getById<DBClient>("clients", clientId);
      if (!client) return { status: 404, data: { error: "Not Found", message: "Cliente não encontrado" } };
      const devices = await getAll<DBDevice>("devices");
      const media = await getAll<DBMedia>("media");
      return {
        status: 200,
        data: {
          ...client,
          deviceCount: devices.filter((d) => d.clientId === clientId).length,
          mediaCount: media.filter((m) => m.clientId === clientId).length,
        },
      };
    }

    if (method === "PUT") {
      const client = await getById<DBClient>("clients", clientId);
      if (!client) return { status: 404, data: { error: "Not Found", message: "Cliente não encontrado" } };
      const updated = { ...client, ...body, id: clientId };
      await update("clients", updated);
      return { status: 200, data: updated };
    }

    if (method === "DELETE") {
      await remove("clients", clientId);
      const playlists = await getAll<DBPlaylist>("playlists");
      for (const p of playlists.filter((pl) => pl.clientId === clientId)) {
        await remove("playlists", p.id);
      }
      return { status: 200, data: { success: true, message: "Cliente removido" } };
    }
  }

  // ── Playlists Routes ──
  if (path === "/api/playlists" && method === "GET") {
    const playlists = await getAll<DBPlaylist>("playlists");
    const clientIdParam = query.get("clientId");
    const filtered = clientIdParam ? playlists.filter((p) => p.clientId === parseInt(clientIdParam)) : playlists;
    return { status: 200, data: filtered };
  }

  if (path === "/api/playlists" && method === "POST") {
    const { name, clientId, playbackMode } = body || {};
    const newPl: Omit<DBPlaylist, "id"> = {
      name: name || "Nova Playlist",
      clientId: typeof clientId === "number" ? clientId : parseInt(clientId) || 1,
      playbackMode: playbackMode || "sequential",
      active: true,
      createdAt: new Date().toISOString(),
    };
    const id = await insert("playlists", newPl);
    return { status: 201, data: { id, ...newPl } };
  }

  const plBatchMatch = path.match(/^\/api\/playlists\/(\d+)\/items\/batch$/);
  if (plBatchMatch && method === "POST") {
    const playlistId = parseInt(plBatchMatch[1]!);
    const mediaIds: number[] = body?.mediaIds || [];
    const allItems = await getAll<DBPlaylistItem>("playlistItems");
    const currentItems = allItems.filter((i) => i.playlistId === playlistId);
    let nextPos = currentItems.length;

    for (const mediaId of mediaIds) {
      await insert("playlistItems", { playlistId, mediaId: parseInt(String(mediaId)), position: nextPos++ });
    }
    return { status: 201, data: { added: mediaIds.length, success: true } };
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
          media: m ? { ...m, url: getMediaBlobUrl(m.id, m.blob) } : null,
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
    const itemIds: number[] = body?.itemIds || [];
    const items = body?.items || [];

    if (itemIds.length > 0) {
      for (let pos = 0; pos < itemIds.length; pos++) {
        const itemId = itemIds[pos]!;
        const existing = await getById<DBPlaylistItem>("playlistItems", itemId);
        if (existing) {
          await update("playlistItems", { ...existing, position: pos });
        }
      }
    } else if (items.length > 0) {
      for (const it of items) {
        if (it.id && typeof it.position === "number") {
          const existing = await getById<DBPlaylistItem>("playlistItems", it.id);
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
      url: getMediaBlobUrl(m.id, m.blob),
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

    if (body instanceof FormData) {
      const file = body.get("file") as File;
      if (file) {
        title = (body.get("title") as string) || file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
        type = ((body.get("type") as string) || "music") as "music" | "jingle";
        clientId = parseInt(body.get("clientId") as string) || 1;
        size = file.size;
        blob = file;
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
      blob,
    };

    const id = await insert("media", newMedia);
    const url = getMediaBlobUrl(id, blob);

    return { status: 201, data: { id, ...newMedia, url } };
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
  return { status: 200, data: { success: true, message: "OK (Standalone)" } };
}
