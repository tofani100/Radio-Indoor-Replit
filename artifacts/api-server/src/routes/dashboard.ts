import { Router } from "express";
import { db, clientsTable, devicesTable, mediaTable, playbackLogsTable } from "@workspace/db";
import { eq, count, gte, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isOnline(lastSeen: Date | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

router.get("/dashboard/summary", requireAdmin, async (req, res) => {
  const [{ totalClients }] = await db.select({ totalClients: count(clientsTable.id) }).from(clientsTable);
  const [{ totalMedia }] = await db.select({ totalMedia: count(mediaTable.id) }).from(mediaTable);

  const deviceCounts = await db
    .select({ status: devicesTable.status, cnt: count(devicesTable.id) })
    .from(devicesTable)
    .groupBy(devicesTable.status);

  const activeDevices = deviceCounts.find((d) => d.status === "active")?.cnt ?? 0;
  const pendingDevices = deviceCounts.find((d) => d.status === "pending")?.cnt ?? 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [{ totalPlaysToday }] = await db
    .select({ totalPlaysToday: count(playbackLogsTable.id) })
    .from(playbackLogsTable)
    .where(gte(playbackLogsTable.playedAt, todayStart));

  const devices = await db.select({ lastSeen: devicesTable.lastSeen, status: devicesTable.status }).from(devicesTable).where(eq(devicesTable.status, "active"));
  const onlineDevices = devices.filter((d) => isOnline(d.lastSeen)).length;
  const offlineDevices = devices.filter((d) => !isOnline(d.lastSeen)).length;

  res.json({ totalClients, activeDevices, pendingDevices, totalMedia, totalPlaysToday, onlineDevices, offlineDevices });
});

router.get("/dashboard/device-status", requireAdmin, async (req, res) => {
  const devices = await db
    .select({
      id: devicesTable.id,
      uuid: devicesTable.uuid,
      email: devicesTable.email,
      status: devicesTable.status,
      lastSeen: devicesTable.lastSeen,
      currentMediaId: devicesTable.currentMediaId,
      clientName: clientsTable.name,
    })
    .from(devicesTable)
    .leftJoin(clientsTable, eq(devicesTable.clientId, clientsTable.id))
    .orderBy(desc(devicesTable.lastSeen));

  const mediaIds = devices.map((d) => d.currentMediaId).filter(Boolean) as number[];
  const mediaMap: Record<number, string> = {};
  if (mediaIds.length > 0) {
    const medias = await db
      .select({ id: mediaTable.id, title: mediaTable.title })
      .from(mediaTable)
      .where(sql`${mediaTable.id} = ANY(${mediaIds})`);
    for (const m of medias) mediaMap[m.id] = m.title;
  }

  const result = devices.map((d) => ({
    id: d.id,
    uuid: d.uuid,
    email: d.email,
    clientName: d.clientName,
    isOnline: isOnline(d.lastSeen),
    lastSeen: d.lastSeen,
    currentMedia: d.currentMediaId ? mediaMap[d.currentMediaId] : undefined,
    status: d.status,
  }));
  res.json(result);
});

router.get("/dashboard/top-media", requireAdmin, async (req, res) => {
  const top = await db
    .select({
      mediaId: playbackLogsTable.mediaId,
      playCount: count(playbackLogsTable.id),
      title: mediaTable.title,
      artist: mediaTable.artist,
      type: mediaTable.type,
    })
    .from(playbackLogsTable)
    .innerJoin(mediaTable, eq(playbackLogsTable.mediaId, mediaTable.id))
    .groupBy(playbackLogsTable.mediaId, mediaTable.title, mediaTable.artist, mediaTable.type)
    .orderBy(desc(count(playbackLogsTable.id)))
    .limit(10);
  res.json(top);
});

router.get("/dashboard/recent-activity", requireAdmin, async (req, res) => {
  const activity = await db
    .select({
      id: playbackLogsTable.id,
      mediaTitle: mediaTable.title,
      mediaType: mediaTable.type,
      clientEmail: playbackLogsTable.clientEmail,
      deviceUuid: playbackLogsTable.deviceUuid,
      playedAt: playbackLogsTable.playedAt,
    })
    .from(playbackLogsTable)
    .innerJoin(mediaTable, eq(playbackLogsTable.mediaId, mediaTable.id))
    .orderBy(desc(playbackLogsTable.playedAt))
    .limit(20);
  res.json(activity);
});

export default router;
