import { Router } from "express";
import { db, devicesTable, clientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isOnline(lastSeen: Date | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

// Public - PWA gatekeeper
router.post("/devices/register", async (req, res) => {
  const { uuid, email } = req.body;
  if (!uuid || !email) {
    res.status(400).json({ error: "Bad Request", message: "uuid and email required" });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUuid = uuid.trim();

  // Find all active clients
  const allClients = await db.select().from(clientsTable).where(eq(clientsTable.active, true));

  const resolvedClient = allClients.find(
    (c) =>
      c.masterEmail.toLowerCase() === cleanEmail ||
      c.email.toLowerCase() === cleanEmail ||
      (c.authorizedEmails ?? []).some((e) => e.toLowerCase() === cleanEmail),
  ) ?? null;

  const matchAuthorized = !!resolvedClient;

  // Check if device already exists by UUID
  const [existing] = await db.select().from(devicesTable).where(eq(devicesTable.uuid, cleanUuid)).limit(1);

  if (existing) {
    if (existing.status === "blocked") {
      res.json({ status: "blocked", message: "Device access has been blocked", clientId: existing.clientId });
      return;
    }

    const newStatus = matchAuthorized ? "active" : "pending";
    const [updated] = await db
      .update(devicesTable)
      .set({
        email: cleanEmail,
        status: newStatus,
        clientId: resolvedClient?.id ?? null,
        lastSeen: new Date(),
      })
      .where(eq(devicesTable.id, existing.id))
      .returning();

    const messages: Record<string, string> = {
      active: "Device authorized",
      pending: resolvedClient ? "Waiting for admin approval" : "E-mail não cadastrado. Peça autorização ao administrador.",
      blocked: "Device access has been blocked",
    };

    res.json({
      status: updated.status,
      message: messages[updated.status] ?? "Unknown",
      clientId: updated.clientId,
      registered: !!resolvedClient,
    });
    return;
  }

  // Check if another device row exists for this email
  const [existingByEmail] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.email, cleanEmail))
    .orderBy(devicesTable.id)
    .limit(1);

  if (existingByEmail) {
    if (existingByEmail.status === "blocked") {
      res.json({ status: "blocked", message: "Device access has been blocked", clientId: existingByEmail.clientId });
      return;
    }

    const newStatus = matchAuthorized ? "active" : "pending";
    const [updated] = await db
      .update(devicesTable)
      .set({
        uuid: cleanUuid,
        status: newStatus,
        clientId: resolvedClient?.id ?? null,
        lastSeen: new Date(),
      })
      .where(eq(devicesTable.id, existingByEmail.id))
      .returning();

    const messages: Record<string, string> = {
      active: "Device authorized",
      pending: resolvedClient ? "Waiting for admin approval" : "E-mail não cadastrado. Peça autorização ao administrador.",
      blocked: "Device access has been blocked",
    };

    res.json({
      status: updated.status,
      message: messages[updated.status] ?? "Unknown",
      clientId: updated.clientId,
      registered: !!resolvedClient,
    });
    return;
  }

  // New device
  const initialStatus = matchAuthorized ? "active" : "pending";
  const [device] = await db
    .insert(devicesTable)
    .values({
      uuid: cleanUuid,
      email: cleanEmail,
      status: initialStatus,
      clientId: resolvedClient?.id ?? null,
      lastSeen: new Date(),
    })
    .returning();

  res.json({
    status: device.status,
    message: matchAuthorized
      ? "Device authorized"
      : resolvedClient
        ? "Waiting for admin approval"
        : "E-mail não cadastrado. Peça autorização ao administrador.",
    clientId: device.clientId,
    registered: !!resolvedClient,
  });
});

// Public - Heartbeat
router.post("/devices/heartbeat", async (req, res) => {
  const { uuid, email, currentMediaId } = req.body;
  if (!uuid || !email) {
    res.status(400).json({ error: "Bad Request", message: "uuid and email required" });
    return;
  }
  const updates: Record<string, unknown> = { lastSeen: new Date() };
  if (currentMediaId !== undefined) updates.currentMediaId = currentMediaId;
  await db.update(devicesTable).set(updates).where(eq(devicesTable.uuid, uuid));
  res.json({ success: true });
});

// Admin - List devices
router.get("/devices", requireAdmin, async (req, res) => {
  const { clientId, status } = req.query;
  const conditions = [];
  if (clientId) conditions.push(eq(devicesTable.clientId, parseInt(clientId as string)));
  if (status) conditions.push(eq(devicesTable.status, status as string));

  const devices = await db
    .select({
      id: devicesTable.id,
      uuid: devicesTable.uuid,
      email: devicesTable.email,
      status: devicesTable.status,
      clientId: devicesTable.clientId,
      lastSeen: devicesTable.lastSeen,
      createdAt: devicesTable.createdAt,
      clientName: clientsTable.name,
    })
    .from(devicesTable)
    .leftJoin(clientsTable, eq(devicesTable.clientId, clientsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(devicesTable.createdAt);

  const result = devices.map((d) => ({
    ...d,
    isOnline: isOnline(d.lastSeen),
  }));
  res.json(result);
});

router.post("/devices/:deviceId/approve", requireAdmin, async (req, res) => {
  const deviceId = parseInt(req.params["deviceId"] as string);
  const [device] = await db
    .update(devicesTable)
    .set({ status: "active" })
    .where(eq(devicesTable.id, deviceId))
    .returning();
  if (!device) {
    res.status(404).json({ error: "Not Found", message: "Device not found" });
    return;
  }
  const [client] = device.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, device.clientId)).limit(1)
    : [null];
  res.json({ ...device, isOnline: isOnline(device.lastSeen), clientName: client?.name });
});

router.post("/devices/:deviceId/block", requireAdmin, async (req, res) => {
  const deviceId = parseInt(req.params["deviceId"] as string);
  const [device] = await db
    .update(devicesTable)
    .set({ status: "blocked" })
    .where(eq(devicesTable.id, deviceId))
    .returning();
  if (!device) {
    res.status(404).json({ error: "Not Found", message: "Device not found" });
    return;
  }
  const [client] = device.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, device.clientId)).limit(1)
    : [null];
  res.json({ ...device, isOnline: isOnline(device.lastSeen), clientName: client?.name });
});

router.delete("/devices/:deviceId", requireAdmin, async (req, res) => {
  const deviceId = parseInt(req.params["deviceId"] as string);
  await db.delete(devicesTable).where(eq(devicesTable.id, deviceId));
  res.json({ success: true, message: "Device deleted" });
});

export default router;
