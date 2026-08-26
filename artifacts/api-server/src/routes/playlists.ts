import { Router } from "express";
import { db, playlistsTable, playlistItemsTable, mediaTable, clientsTable } from "@workspace/db";
import { eq, count, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/playlists", requireAdmin, async (req, res) => {
  const { clientId } = req.query;
  const playlists = await db
    .select({
      id: playlistsTable.id,
      name: playlistsTable.name,
      clientId: playlistsTable.clientId,
      playbackMode: playlistsTable.playbackMode,
      active: playlistsTable.active,
      createdAt: playlistsTable.createdAt,
      clientName: clientsTable.name,
      itemCount: count(playlistItemsTable.id),
    })
    .from(playlistsTable)
    .leftJoin(clientsTable, eq(playlistsTable.clientId, clientsTable.id))
    .leftJoin(playlistItemsTable, eq(playlistItemsTable.playlistId, playlistsTable.id))
    .where(clientId ? eq(playlistsTable.clientId, parseInt(clientId as string)) : undefined)
    .groupBy(playlistsTable.id, clientsTable.name)
    .orderBy(playlistsTable.createdAt);
  res.json(playlists);
});

router.post("/playlists", requireAdmin, async (req, res) => {
  const { name, clientId, playbackMode } = req.body;
  if (!name || !clientId) {
    res.status(400).json({ error: "Bad Request", message: "name and clientId required" });
    return;
  }
  const [playlist] = await db
    .insert(playlistsTable)
    .values({ name, clientId, playbackMode: playbackMode ?? "sequential" })
    .returning();
  res.status(201).json({ ...playlist, clientName: undefined, itemCount: 0 });
});

router.get("/playlists/:playlistId", requireAdmin, async (req, res) => {
  const playlistId = parseInt(req.params["playlistId"] as string);
  const [playlist] = await db.select().from(playlistsTable).where(eq(playlistsTable.id, playlistId)).limit(1);
  if (!playlist) {
    res.status(404).json({ error: "Not Found", message: "Playlist not found" });
    return;
  }
  const items = await db
    .select({
      id: playlistItemsTable.id,
      playlistId: playlistItemsTable.playlistId,
      mediaId: playlistItemsTable.mediaId,
      position: playlistItemsTable.position,
      media: {
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
      },
    })
    .from(playlistItemsTable)
    .leftJoin(mediaTable, eq(playlistItemsTable.mediaId, mediaTable.id))
    .where(eq(playlistItemsTable.playlistId, playlistId))
    .orderBy(asc(playlistItemsTable.position));

  const itemsWithUrl = items.map((item) => ({
    ...item,
    media: item.media
      ? {
          ...item.media,
          url: `/api/uploads/${item.media.filename}`,
        }
      : null,
  }));
  res.json({ ...playlist, items: itemsWithUrl });
});

router.put("/playlists/:playlistId", requireAdmin, async (req, res) => {
  const playlistId = parseInt(req.params["playlistId"] as string);
  const { name, playbackMode, active } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (playbackMode !== undefined) updates.playbackMode = playbackMode;
  if (active !== undefined) updates.active = active;
  const [playlist] = await db.update(playlistsTable).set(updates).where(eq(playlistsTable.id, playlistId)).returning();
  if (!playlist) {
    res.status(404).json({ error: "Not Found", message: "Playlist not found" });
    return;
  }
  const [{ cnt: itemCount }] = await db.select({ cnt: count(playlistItemsTable.id) }).from(playlistItemsTable).where(eq(playlistItemsTable.playlistId, playlistId));
  res.json({ ...playlist, itemCount });
});

router.delete("/playlists/:playlistId", requireAdmin, async (req, res) => {
  const playlistId = parseInt(req.params["playlistId"] as string);
  await db.delete(playlistsTable).where(eq(playlistsTable.id, playlistId));
  res.json({ success: true, message: "Playlist deleted" });
});

router.post("/playlists/:playlistId/items", requireAdmin, async (req, res) => {
  const playlistId = parseInt(req.params["playlistId"] as string);
  const { mediaId, position } = req.body;
  if (!mediaId) {
    res.status(400).json({ error: "Bad Request", message: "mediaId required" });
    return;
  }
  const [{ maxPos }] = await db
    .select({ maxPos: count(playlistItemsTable.id) })
    .from(playlistItemsTable)
    .where(eq(playlistItemsTable.playlistId, playlistId));
  const [item] = await db
    .insert(playlistItemsTable)
    .values({ playlistId, mediaId, position: position ?? maxPos })
    .returning();
  res.status(201).json(item);
});

router.post("/playlists/:playlistId/items/batch", requireAdmin, async (req, res) => {
  const playlistId = parseInt(req.params["playlistId"] as string);
  const { mediaIds } = req.body as { mediaIds?: number[] };
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    res.status(400).json({ error: "Bad Request", message: "mediaIds array required" });
    return;
  }
  const [{ maxPos }] = await db
    .select({ maxPos: count(playlistItemsTable.id) })
    .from(playlistItemsTable)
    .where(eq(playlistItemsTable.playlistId, playlistId));
  const values = mediaIds.map((mediaId, idx) => ({
    playlistId,
    mediaId,
    position: (maxPos as number) + idx,
  }));
  await db.insert(playlistItemsTable).values(values);
  res.status(201).json({ added: values.length });
});

router.put("/playlists/:playlistId/reorder", requireAdmin, async (req, res) => {
  const playlistId = parseInt(req.params["playlistId"] as string);
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) {
    res.status(400).json({ error: "Bad Request", message: "itemIds array required" });
    return;
  }
  for (let i = 0; i < itemIds.length; i++) {
    await db
      .update(playlistItemsTable)
      .set({ position: i })
      .where(eq(playlistItemsTable.id, itemIds[i]));
  }
  res.json({ success: true });
});

router.delete("/playlists/:playlistId/items/:itemId", requireAdmin, async (req, res) => {
  const itemId = parseInt(req.params["itemId"] as string);
  await db.delete(playlistItemsTable).where(eq(playlistItemsTable.id, itemId));
  res.json({ success: true, message: "Item removed" });
});

export default router;
