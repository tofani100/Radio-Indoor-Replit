import { Router } from "express";
import { db, playbackLogsTable, mediaTable, devicesTable, clientsTable } from "@workspace/db";
import { eq, gte, lte, and, desc, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// Gap between consecutive plays that ends a session (minutes)
const SESSION_GAP_MINUTES = 30;
// When a session has only one play (or last play of session), assume the
// player kept going for this many minutes after the last log.
const TAIL_DURATION_MINUTES = 5;

router.get("/reports/playbacks", requireAdmin, async (req, res) => {
  const { startDate, endDate, clientEmail, mediaId } = req.query;
  const conditions = [];

  if (startDate) {
    conditions.push(gte(playbackLogsTable.playedAt, new Date(startDate as string)));
  }
  if (endDate) {
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(playbackLogsTable.playedAt, end));
  }
  if (clientEmail) {
    conditions.push(eq(playbackLogsTable.clientEmail, clientEmail as string));
  }
  if (mediaId) {
    conditions.push(eq(playbackLogsTable.mediaId, parseInt(mediaId as string)));
  }

  const entries = await db
    .select({
      id: playbackLogsTable.id,
      mediaId: playbackLogsTable.mediaId,
      mediaTitle: mediaTable.title,
      mediaType: mediaTable.type,
      deviceUuid: playbackLogsTable.deviceUuid,
      clientEmail: playbackLogsTable.clientEmail,
      playedAt: playbackLogsTable.playedAt,
    })
    .from(playbackLogsTable)
    .innerJoin(mediaTable, eq(playbackLogsTable.mediaId, mediaTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(playbackLogsTable.playedAt))
    .limit(500);

  res.json({ totalPlays: entries.length, entries });
});

// Per-client session report: who connected (email), when (start/end of each
// session, including multiple per day), and how many times each LOCUCAO
// (jingle) was played by each email. Music plays are returned as a count
// only — admin requested no detail on music.
router.get("/reports/client-sessions", requireAdmin, async (req, res) => {
  const clientIdRaw = req.query.clientId as string | undefined;
  const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : NaN;
  if (!clientId || Number.isNaN(clientId)) {
    res.status(400).json({ error: "Bad Request", message: "clientId required" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  if (!client) {
    res.status(404).json({ error: "Not Found", message: "Client not found" });
    return;
  }

  const conditions = [eq(devicesTable.clientId, clientId)];
  if (req.query.startDate) {
    conditions.push(gte(playbackLogsTable.playedAt, new Date(req.query.startDate as string)));
  }
  if (req.query.endDate) {
    const end = new Date(req.query.endDate as string);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(playbackLogsTable.playedAt, end));
  }

  // All plays for devices currently linked to this client, with media type.
  const rows = await db
    .select({
      playedAt: playbackLogsTable.playedAt,
      deviceUuid: playbackLogsTable.deviceUuid,
      clientEmail: playbackLogsTable.clientEmail,
      mediaId: mediaTable.id,
      mediaTitle: mediaTable.title,
      mediaType: mediaTable.type,
    })
    .from(playbackLogsTable)
    .innerJoin(devicesTable, eq(playbackLogsTable.deviceId, devicesTable.id))
    .innerJoin(mediaTable, eq(playbackLogsTable.mediaId, mediaTable.id))
    .where(and(...conditions))
    .orderBy(asc(playbackLogsTable.deviceUuid), asc(playbackLogsTable.clientEmail), asc(playbackLogsTable.playedAt));

  type Row = typeof rows[number];

  // Group by deviceUuid + email then split into sessions by gap.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.deviceUuid}__${r.clientEmail}`;
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
      if (!current) {
        current = {
          email: r.clientEmail,
          deviceUuid: r.deviceUuid,
          startedAt: new Date(r.playedAt).toISOString(),
          endedAt: new Date(r.playedAt).toISOString(),
          durationMinutes: 0,
          jinglePlays: 0,
          musicPlays: 0,
          jingleByMedia: new Map(),
        };
      }
      current.endedAt = new Date(r.playedAt).toISOString();
      if (r.mediaType === "jingle") {
        current.jinglePlays++;
        const existing = current.jingleByMedia.get(r.mediaId);
        if (existing) existing.plays++;
        else current.jingleByMedia.set(r.mediaId, { mediaId: r.mediaId, title: r.mediaTitle, plays: 1 });
      } else {
        current.musicPlays++;
      }
      lastPlayed = t;
    }
    if (current) sessions.push(current);
  }

  // Compute durations: end - start, plus tail minutes for the final play.
  for (const s of sessions) {
    const start = new Date(s.startedAt).getTime();
    const end = new Date(s.endedAt).getTime();
    s.durationMinutes = Math.round(((end - start) / 60_000 + TAIL_DURATION_MINUTES) * 10) / 10;
  }

  // Aggregate per-email summary.
  type EmailAgg = {
    email: string;
    sessionsCount: number;
    totalDurationMinutes: number;
    jingles: Map<number, { mediaId: number; title: string; plays: number }>;
  };
  const byEmail = new Map<string, EmailAgg>();
  for (const s of sessions) {
    if (!byEmail.has(s.email)) {
      byEmail.set(s.email, { email: s.email, sessionsCount: 0, totalDurationMinutes: 0, jingles: new Map() });
    }
    const agg = byEmail.get(s.email)!;
    agg.sessionsCount++;
    agg.totalDurationMinutes = Math.round((agg.totalDurationMinutes + s.durationMinutes) * 10) / 10;
    for (const [mid, jm] of s.jingleByMedia) {
      const existing = agg.jingles.get(mid);
      if (existing) existing.plays += jm.plays;
      else agg.jingles.set(mid, { ...jm });
    }
  }

  // Order: sessions desc by startedAt; emailSummary desc by sessionsCount.
  const sessionsOut = sessions
    .slice()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map((s) => ({
      email: s.email,
      deviceUuid: s.deviceUuid,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMinutes: s.durationMinutes,
      jinglePlays: s.jinglePlays,
      musicPlays: s.musicPlays,
    }));
  const emailSummaryOut = Array.from(byEmail.values())
    .sort((a, b) => b.sessionsCount - a.sessionsCount)
    .map((a) => ({
      email: a.email,
      sessionsCount: a.sessionsCount,
      totalDurationMinutes: a.totalDurationMinutes,
      jingles: Array.from(a.jingles.values()).sort((x, y) => y.plays - x.plays),
    }));

  res.json({
    clientId,
    clientName: client.name,
    sessions: sessionsOut,
    emailSummary: emailSummaryOut,
  });
});

export default router;
