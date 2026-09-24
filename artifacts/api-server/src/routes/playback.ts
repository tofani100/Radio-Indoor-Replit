import { Router } from "express";
import { db, devicesTable, clientsTable, playlistsTable, playlistItemsTable, mediaTable, playbackLogsTable } from "@workspace/db";
import { eq, and, asc, inArray, count } from "drizzle-orm";

const router = Router();

/** Shared helper: verify device is active and return device + matching clients */
async function resolveDevice(uuid: string, email: string) {
  const cleanEmail = (email ?? "").trim().toLowerCase();
  const cleanUuid = (uuid ?? "").trim();
  if (!cleanUuid || !cleanEmail) {
    return { error: "Bad Request", message: "uuid and email required" };
  }

  // Find all active clients
  const allClients = await db.select().from(clientsTable).where(eq(clientsTable.active, true));

  // Match any active client where the email is in authorizedEmails, or legacy masterEmail / email
  const matchingClients = allClients.filter(
    (c) =>
      c.masterEmail.toLowerCase() === cleanEmail ||
      c.email.toLowerCase() === cleanEmail ||
      (c.authorizedEmails ?? []).some((e) => e.toLowerCase() === cleanEmail),
  );

  const client = matchingClients[0] ?? null;

  // Check device in DB
  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.uuid, cleanUuid))
    .limit(1);

  if (device && device.status === "blocked") {
    return { error: "Forbidden", message: "Dispositivo bloqueado pelo administrador" };
  }

  if (client) {
    // If email is directly authorized on active client(s), auto-ensure device is active and associated
    if (device) {
      if (device.status !== "active" || device.email.toLowerCase() !== cleanEmail) {
        await db
          .update(devicesTable)
          .set({ status: "active", clientId: client.id, email: cleanEmail, lastSeen: new Date() })
          .where(eq(devicesTable.id, device.id));
        device.status = "active";
        device.clientId = client.id;
      }
      return { device, client, matchingClients };
    } else {
      const [newDev] = await db
        .insert(devicesTable)
        .values({ uuid: cleanUuid, email: cleanEmail, status: "active", clientId: client.id, lastSeen: new Date() })
        .returning();
      return { device: newDev, client, matchingClients };
    }
  }

  // Fallback for manually approved devices
  if (device && device.status === "active" && device.clientId) {
    const [assignedClient] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.id, device.clientId), eq(clientsTable.active, true)))
      .limit(1);
    if (assignedClient) {
      return { device, client: assignedClient, matchingClients: [assignedClient] };
    }
  }

  return { error: "Forbidden", message: "E-mail não cadastrado ou dispositivo não autorizado" };
}

// Public - list all active playlists for the device's client(s)
router.get("/playback/playlists", async (req, res) => {
  const { uuid, email } = req.query;
  if (!uuid || !email) {
    res.status(400).json({ error: "Bad Request", message: "uuid and email required" });
    return;
  }

  const result = await resolveDevice(uuid as string, email as string);
  if ("error" in result) {
    res.status(result.error === "Not Found" ? 404 : 403).json(result);
    return;
  }

  const { matchingClients } = result;
  const clientIds = matchingClients.map((c) => c.id);
  const clientMap = new Map(matchingClients.map((c) => [c.id, c.name]));

  // Single query: join playlist_items and count per playlist (no N+1)
  const playlistsWithCount = await db
    .select({
      id: playlistsTable.id,
      name: playlistsTable.name,
      clientId: playlistsTable.clientId,
      itemCount: count(playlistItemsTable.id),
    })
    .from(playlistsTable)
    .leftJoin(playlistItemsTable, eq(playlistItemsTable.playlistId, playlistsTable.id))
    .where(and(inArray(playlistsTable.clientId, clientIds), eq(playlistsTable.active, true)))
    .groupBy(playlistsTable.id, playlistsTable.name, playlistsTable.clientId)
    .orderBy(asc(playlistsTable.id));

  const response = playlistsWithCount.map((pl) => {
    const clientName = clientMap.get(pl.clientId) ?? "";
    return {
      id: pl.id,
      name: matchingClients.length > 1 ? `${clientName} — ${pl.name}` : pl.name,
      clientName,
      itemCount: Number(pl.itemCount),
      // Global playlists belong to the system client (id=1); commercial ones to the specific client
      isGlobal: pl.clientId === 1,
    };
  });

  res.json(response);
});


// Public - get playback queue for a device
router.get("/playback/queue", async (req, res) => {
  const { uuid, email, playlistId, playlistIds } = req.query;
  if (!uuid || !email) {
    res.status(400).json({ error: "Bad Request", message: "uuid and email required" });
    return;
  }

  const result = await resolveDevice(uuid as string, email as string);
  if ("error" in result) {
    res.status(result.error === "Not Found" ? 404 : 403).json(result);
    return;
  }

  const { device, client, matchingClients } = result;
  const clientIds = matchingClients.map((c) => c.id);

  const requestedPlaylistIds = playlistIds
    ? (playlistIds as string).split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0)
    : (playlistId && parseInt(playlistId as string, 10) > 0 ? [parseInt(playlistId as string, 10)] : []);

  // Try to load the requested playlist among all authorized clients; fall back to first active
  let playlist: { id: number; name: string; clientId: number; playbackMode: string; active: boolean } | undefined;
  let activeClient = client;

  if (requestedPlaylistIds.length > 0) {
    const [found] = await db
      .select()
      .from(playlistsTable)
      .where(and(inArray(playlistsTable.id, requestedPlaylistIds), inArray(playlistsTable.clientId, clientIds), eq(playlistsTable.active, true)))
      .limit(1);
    if (found) {
      playlist = found;
      activeClient = matchingClients.find((c) => c.id === found.clientId) ?? client;
    }
  }

  if (!playlist) {
    const [first] = await db
      .select()
      .from(playlistsTable)
      .where(and(inArray(playlistsTable.clientId, clientIds), eq(playlistsTable.active, true)))
      .orderBy(asc(playlistsTable.id))
      .limit(1);
    if (first) {
      playlist = first;
      activeClient = matchingClients.find((c) => c.id === first.clientId) ?? client;
    }
  }

  if (!playlist) {
    res.json({
      clientId: activeClient.id,
      deviceId: device.id,
      playlistId: null,
      currentIndex: 0,
      playbackMode: activeClient.playbackMode,
      jingleMode: activeClient.jingleMode,
      jingleInterval: activeClient.jingleInterval,
      jingleCount: activeClient.jingleCount ?? 1,
      voiceoverCount: activeClient.voiceoverCount ?? 1,
      jingleIntervalSeconds: activeClient.jingleIntervalSeconds,
      musicVolume: 1.0,
      jingleVolume: 0.8,
      items: [],
    });
    return;
  }

  const queryPlaylistIds = requestedPlaylistIds.length > 0 ? requestedPlaylistIds : [playlist.id];

  const items = await db
    .select({
      id: mediaTable.id,
      title: mediaTable.title,
      artist: mediaTable.artist,
      type: mediaTable.type,
      filename: mediaTable.filename,
      filePath: mediaTable.filePath,
      duration: mediaTable.duration,
      clientId: mediaTable.clientId,
      gain: mediaTable.gain,
      coverUrl: mediaTable.coverUrl,
      createdAt: mediaTable.createdAt,
    })
    .from(playlistItemsTable)
    .innerJoin(mediaTable, eq(playlistItemsTable.mediaId, mediaTable.id))
    .where(inArray(playlistItemsTable.playlistId, queryPlaylistIds))
    .orderBy(asc(playlistItemsTable.position));

  const itemsWithUrl = items.map((item) => ({
    ...item,
    url: `/api/uploads/${item.filename}`,
  }));

  // Deduplicate by mediaId — keeps only the first occurrence per track.
  // This corrects any double-inserts that may already exist in the database
  // without requiring a database migration or cleanup script.
  const seen = new Set<number>();
  const dedupedItems = itemsWithUrl.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  res.json({
    clientId: activeClient.id,
    deviceId: device.id,
    playlistId: playlist.id,
    currentIndex: 0,
    playbackMode: activeClient.playbackMode,
    jingleMode: activeClient.jingleMode,
    jingleInterval: activeClient.jingleInterval,
    jingleCount: activeClient.jingleCount ?? 1,
    voiceoverCount: activeClient.voiceoverCount ?? 1,
    jingleIntervalSeconds: activeClient.jingleIntervalSeconds,
    musicVolume: 1.0,
    jingleVolume: 0.8,
    items: dedupedItems,
  });
});

// Public - log a playback event
router.post("/playback/log", async (req, res) => {
  const { mediaId, uuid, email, playedAt } = req.body;
  if (!mediaId || !uuid || !email) {
    res.status(400).json({ error: "Bad Request", message: "mediaId, uuid and email required" });
    return;
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.uuid, uuid)).limit(1);

  await db.insert(playbackLogsTable).values({
    mediaId,
    deviceId: device?.id ?? null,
    deviceUuid: uuid,
    clientEmail: email,
    playedAt: playedAt ? new Date(playedAt) : new Date(),
  });

  res.status(201).json({ success: true });
});

export default router;
