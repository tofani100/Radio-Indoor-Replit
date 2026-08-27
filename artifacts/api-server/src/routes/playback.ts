import { Router } from "express";
import { db, devicesTable, clientsTable, playlistsTable, playlistItemsTable, mediaTable, playbackLogsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router = Router();

/** Shared helper: verify device is active and return device + client */
async function resolveDevice(uuid: string, email: string) {
  const cleanEmail = (email ?? "").trim().toLowerCase();
  const cleanUuid = (uuid ?? "").trim();
  if (!cleanUuid || !cleanEmail) {
    return { error: "Bad Request", message: "uuid and email required" };
  }

  // Find active client matching this email
  const allClients = await db.select().from(clientsTable).where(eq(clientsTable.active, true));

  const client = allClients.find(
    (c) =>
      c.masterEmail.toLowerCase() === cleanEmail ||
      (c.authorizedEmails ?? []).some((e) => e.toLowerCase() === cleanEmail),
  );

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
    // If email is directly authorized on active client, auto-ensure device is active and associated
    if (device) {
      if (device.status !== "active" || device.clientId !== client.id || device.email.toLowerCase() !== cleanEmail) {
        await db
          .update(devicesTable)
          .set({ status: "active", clientId: client.id, email: cleanEmail, lastSeen: new Date() })
          .where(eq(devicesTable.id, device.id));
        device.status = "active";
        device.clientId = client.id;
      }
      return { device, client };
    } else {
      const [newDev] = await db
        .insert(devicesTable)
        .values({ uuid: cleanUuid, email: cleanEmail, status: "active", clientId: client.id, lastSeen: new Date() })
        .returning();
      return { device: newDev, client };
    }
  }

  // If not auto-authorized via master/authorized emails, check if device was manually approved for a client
  if (device && device.status === "active" && device.clientId) {
    const [assignedClient] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.id, device.clientId), eq(clientsTable.active, true)))
      .limit(1);
    if (assignedClient && (device.email.toLowerCase() === cleanEmail || assignedClient.email.toLowerCase() === cleanEmail)) {
      return { device, client: assignedClient };
    }
  }

  return { error: "Forbidden", message: "E-mail não cadastrado ou dispositivo não autorizado" };
}

// Public - list all active playlists for the device's client
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

  const { client } = result;

  const playlists = await db
    .select({
      id: playlistsTable.id,
      name: playlistsTable.name,
    })
    .from(playlistsTable)
    .where(and(eq(playlistsTable.clientId, client.id), eq(playlistsTable.active, true)))
    .orderBy(asc(playlistsTable.id));

  // Get item counts per playlist
  const playlistsWithCount = await Promise.all(
    playlists.map(async (pl) => {
      const items = await db
        .select({ id: playlistItemsTable.id })
        .from(playlistItemsTable)
        .where(eq(playlistItemsTable.playlistId, pl.id));
      return { id: pl.id, name: pl.name, itemCount: items.length };
    })
  );

  res.json(playlistsWithCount);
});

// Public - get playback queue for a device
router.get("/playback/queue", async (req, res) => {
  const { uuid, email, playlistId } = req.query;
  if (!uuid || !email) {
    res.status(400).json({ error: "Bad Request", message: "uuid and email required" });
    return;
  }

  const result = await resolveDevice(uuid as string, email as string);
  if ("error" in result) {
    res.status(result.error === "Not Found" ? 404 : 403).json(result);
    return;
  }

  const { device, client } = result;

  // Try to load the requested playlist; fall back to first active if omitted/invalid
  let playlist: { id: number; name: string; clientId: number; playbackMode: string; active: boolean } | undefined;

  if (playlistId) {
    const requestedId = parseInt(playlistId as string, 10);
    if (!isNaN(requestedId)) {
      // Only allow playlist that belongs to this client
      const [found] = await db
        .select()
        .from(playlistsTable)
        .where(and(eq(playlistsTable.id, requestedId), eq(playlistsTable.clientId, client.id), eq(playlistsTable.active, true)))
        .limit(1);
      playlist = found;
    }
  }

  if (!playlist) {
    // Fallback: first active playlist for the client
    const [first] = await db
      .select()
      .from(playlistsTable)
      .where(and(eq(playlistsTable.clientId, client.id), eq(playlistsTable.active, true)))
      .orderBy(asc(playlistsTable.id))
      .limit(1);
    playlist = first;
  }

  if (!playlist) {
    res.json({
      clientId: client.id,
      deviceId: device.id,
      playlistId: null,
      currentIndex: 0,
      playbackMode: client.playbackMode,
      jingleMode: client.jingleMode,
      jingleInterval: client.jingleInterval,
      jingleIntervalSeconds: client.jingleIntervalSeconds,
      musicVolume: 1.0,
      jingleVolume: 0.8,
      items: [],
    });
    return;
  }

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
    .where(eq(playlistItemsTable.playlistId, playlist.id))
    .orderBy(asc(playlistItemsTable.position));

  const itemsWithUrl = items.map((item) => ({
    ...item,
    url: `/api/uploads/${item.filename}`,
  }));

  res.json({
    clientId: client.id,
    deviceId: device.id,
    playlistId: playlist.id,
    currentIndex: 0,
    playbackMode: client.playbackMode,
    jingleMode: client.jingleMode,
    jingleInterval: client.jingleInterval,
    jingleIntervalSeconds: client.jingleIntervalSeconds,
    musicVolume: 1.0,
    jingleVolume: 0.8,
    items: itemsWithUrl,
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
