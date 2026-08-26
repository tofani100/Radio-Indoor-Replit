import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, clientsTable, devicesTable, mediaTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/clients", requireAdmin, async (req, res) => {
  const clients = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      masterEmail: clientsTable.masterEmail,
      authorizedEmails: clientsTable.authorizedEmails,
      playbackMode: clientsTable.playbackMode,
      jingleMode: clientsTable.jingleMode,
      jingleInterval: clientsTable.jingleInterval,
      jingleIntervalSeconds: clientsTable.jingleIntervalSeconds,
      active: clientsTable.active,
      createdAt: clientsTable.createdAt,
      deviceCount: count(devicesTable.id),
    })
    .from(clientsTable)
    .leftJoin(devicesTable, eq(devicesTable.clientId, clientsTable.id))
    .groupBy(clientsTable.id)
    .orderBy(clientsTable.name);

  const mediaCountsRaw = await db
    .select({ clientId: mediaTable.clientId, cnt: count(mediaTable.id) })
    .from(mediaTable)
    .groupBy(mediaTable.clientId);
  const mediaCounts = Object.fromEntries(mediaCountsRaw.map((r) => [r.clientId, r.cnt]));

  const result = clients.map((c) => ({
    ...c,
    mediaCount: mediaCounts[c.id] ?? 0,
  }));
  res.json(result);
});

function sanitizeEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0 && /^\S+@\S+\.\S+$/.test(v));
  return Array.from(new Set(cleaned));
}

router.post("/clients", requireAdmin, async (req, res) => {
  const { name, email, masterEmail, password, playbackMode, jingleMode, jingleInterval, jingleIntervalSeconds, authorizedEmails } = req.body;
  if (!name || !email || !masterEmail || !password) {
    res.status(400).json({ error: "Bad Request", message: "name, email, masterEmail and password required" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [client] = await db
    .insert(clientsTable)
    .values({
      name,
      email,
      masterEmail,
      authorizedEmails: sanitizeEmails(authorizedEmails),
      passwordHash,
      playbackMode: playbackMode ?? "sequential",
      jingleMode: jingleMode ?? "interval",
      jingleInterval: jingleInterval ?? 3,
      jingleIntervalSeconds: jingleIntervalSeconds ?? 900,
    })
    .returning();
  res.status(201).json({ ...client, deviceCount: 0, mediaCount: 0 });
});

router.get("/clients/:clientId", requireAdmin, async (req, res) => {
  const clientId = parseInt(req.params["clientId"] as string);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  if (!client) {
    res.status(404).json({ error: "Not Found", message: "Client not found" });
    return;
  }
  const [{ cnt: deviceCount }] = await db.select({ cnt: count(devicesTable.id) }).from(devicesTable).where(eq(devicesTable.clientId, clientId));
  const [{ cnt: mediaCount }] = await db.select({ cnt: count(mediaTable.id) }).from(mediaTable).where(eq(mediaTable.clientId, clientId));
  res.json({ ...client, deviceCount, mediaCount });
});

router.put("/clients/:clientId", requireAdmin, async (req, res) => {
  const clientId = parseInt(req.params["clientId"] as string);
  const { name, email, masterEmail, playbackMode, jingleMode, jingleInterval, jingleIntervalSeconds, active, authorizedEmails } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (masterEmail !== undefined) updates.masterEmail = masterEmail;
  if (authorizedEmails !== undefined) updates.authorizedEmails = sanitizeEmails(authorizedEmails);
  if (playbackMode !== undefined) updates.playbackMode = playbackMode;
  if (jingleMode !== undefined) updates.jingleMode = jingleMode;
  if (jingleInterval !== undefined) updates.jingleInterval = jingleInterval;
  if (jingleIntervalSeconds !== undefined) updates.jingleIntervalSeconds = jingleIntervalSeconds;
  if (active !== undefined) updates.active = active;

  const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, clientId)).returning();
  if (!client) {
    res.status(404).json({ error: "Not Found", message: "Client not found" });
    return;
  }
  const [{ cnt: deviceCount }] = await db.select({ cnt: count(devicesTable.id) }).from(devicesTable).where(eq(devicesTable.clientId, clientId));
  const [{ cnt: mediaCount }] = await db.select({ cnt: count(mediaTable.id) }).from(mediaTable).where(eq(mediaTable.clientId, clientId));
  res.json({ ...client, deviceCount, mediaCount });
});

router.delete("/clients/:clientId", requireAdmin, async (req, res) => {
  const clientId = parseInt(req.params["clientId"] as string);
  await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
  res.json({ success: true, message: "Client deleted" });
});

export default router;
