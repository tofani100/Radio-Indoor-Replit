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

  // Check if device already exists
  const [existing] = await db.select().from(devicesTable).where(eq(devicesTable.uuid, uuid)).limit(1);
  if (existing) {
    // If the email submitted now differs from what we stored (e.g. user mistyped
    // the first time, or browser autofill put the wrong email), update the email
    // so the device row reflects who is actually using this browser. This also
    // lets the device move from pending/blocked to active if the new email is
    // whitelisted by an active client.
    const submittedNormalized = email.trim().toLowerCase();
    const storedNormalized = (existing.email ?? "").trim().toLowerCase();
    if (submittedNormalized && submittedNormalized !== storedNormalized) {
      const allClientsForUpdate = await db.select().from(clientsTable);
      const matchAuthorized = allClientsForUpdate.find(
        (c) =>
          c.active &&
          (c.masterEmail.toLowerCase() === submittedNormalized ||
            (c.authorizedEmails ?? []).some((e) => e.toLowerCase() === submittedNormalized)),
      ) ?? null;
      const matchLogin = !matchAuthorized
        ? allClientsForUpdate.find((c) => c.email.toLowerCase() === submittedNormalized) ?? null
        : null;
      const newClient = matchAuthorized ?? matchLogin ?? null;
      const newStatus = matchAuthorized ? "active" : (existing.status === "blocked" ? "blocked" : "pending");
      const [updated] = await db
        .update(devicesTable)
        .set({ email, status: newStatus, clientId: newClient?.id ?? null, lastSeen: new Date() })
        .where(eq(devicesTable.uuid, uuid))
        .returning();
      const updMsgs: Record<string, string> = {
        active: "Device authorized",
        pending: "Waiting for admin approval",
        blocked: "Device access has been blocked",
      };
      res.json({ status: updated.status, message: updMsgs[updated.status] ?? "Unknown", clientId: updated.clientId });
      return;
    }
    const messages: Record<string, string> = {
      active: "Device authorized",
      pending: "Waiting for admin approval",
      blocked: "Device access has been blocked",
    };
    res.json({ status: existing.status, message: messages[existing.status] ?? "Unknown", clientId: existing.clientId });
    return;
  }

  // Find client by login email, master email, or any pre-authorized email.
  // Only ACTIVE clients participate in auto-approval — devices for inactive
  // clients still register but go to pending so the admin can review.
  // Precedence: explicit whitelist (masterEmail / authorizedEmails) wins
  // over the login email. So a device whose email is whitelisted is always
  // auto-approved, even if it happens to also be a login email.
  const normalizedEmail = email.trim().toLowerCase();
  const allClients = await db.select().from(clientsTable);

  const byAuthorized = allClients.find(
    (c) =>
      c.active &&
      (c.masterEmail.toLowerCase() === normalizedEmail ||
        (c.authorizedEmails ?? []).some((e) => e.toLowerCase() === normalizedEmail)),
  ) ?? null;

  const byLogin = !byAuthorized
    ? allClients.find((c) => c.email.toLowerCase() === normalizedEmail) ?? null
    : null;

  const resolvedClient = byAuthorized ?? byLogin ?? null;
  const status = byAuthorized ? "active" : "pending";

  // If another device row already exists for this email, re-use it (update the
  // UUID to the current browser's UUID) instead of inserting a duplicate row.
  // This prevents the same store email from accumulating multiple device rows
  // each time the browser's localStorage is cleared.
  const [existingByEmail] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.email, email.trim()))
    .orderBy(devicesTable.id)
    .limit(1);

  if (existingByEmail) {
    // Preserve the existing approval status unless a new client match improves it.
    const newStatus = byAuthorized ? "active" : (existingByEmail.status === "blocked" ? "blocked" : existingByEmail.status);
    const [updated] = await db
      .update(devicesTable)
      .set({ uuid, status: newStatus, clientId: resolvedClient?.id ?? existingByEmail.clientId, lastSeen: new Date() })
      .where(eq(devicesTable.id, existingByEmail.id))
      .returning();
    const messages: Record<string, string> = {
      active: "Device authorized",
      pending: "Waiting for admin approval",
      blocked: "Device access has been blocked",
    };
    res.json({ status: updated.status, message: messages[updated.status] ?? "Unknown", clientId: updated.clientId });
    return;
  }

  const [device] = await db
    .insert(devicesTable)
    .values({
      uuid,
      email,
      status,
      clientId: resolvedClient?.id ?? null,
      lastSeen: new Date(),
    })
    .returning();

  res.json({
    status: device.status,
    message: status === "active" ? "Device authorized" : "Waiting for admin approval",
    clientId: device.clientId,
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
