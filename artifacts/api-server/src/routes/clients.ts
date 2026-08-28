import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, clientsTable, devicesTable, mediaTable, playlistsTable, playlistItemsTable, playbackLogsTable } from "@workspace/db";
import { eq, count, sql, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/clients", requireAdmin, async (req, res) => {
  try {
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
        jingleCount: clientsTable.jingleCount,
        voiceoverCount: clientsTable.voiceoverCount,
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
  } catch (err: any) {
    req.log.error({ err }, "Erro ao listar clientes");
    res.status(500).json({ error: "Internal Server Error", message: "Erro ao buscar clientes" });
  }
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
  try {
    const { name, email, masterEmail, password, playbackMode, jingleMode, jingleInterval, jingleCount, voiceoverCount, jingleIntervalSeconds, authorizedEmails } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Bad Request", message: "Nome do cliente é obrigatório" });
      return;
    }

    const cleanEmails = sanitizeEmails(authorizedEmails);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    let cleanEmail = (email && email.trim()) 
      ? email.trim().toLowerCase() 
      : cleanEmails[0] || `${slug || "cliente"}_${Date.now()}@cliente.radioindoor.com`;
    const cleanMasterEmail = (masterEmail && masterEmail.trim()) 
      ? masterEmail.trim().toLowerCase() 
      : cleanEmails[0] || cleanEmail;

    // Ensure unique email column value in DB
    const [existing] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.email, cleanEmail))
      .limit(1);

    if (existing) {
      if (email && email.trim()) {
        res.status(400).json({ error: "Bad Request", message: "Este email já está cadastrado para outro cliente" });
        return;
      }
      cleanEmail = `${slug || "cliente"}_${Date.now()}@cliente.radioindoor.com`;
    }

    const passwordHash = await bcrypt.hash(password || "radioindoor2025", 10);
    const [client] = await db
      .insert(clientsTable)
      .values({
        name: name.trim(),
        email: cleanEmail,
        masterEmail: cleanMasterEmail,
        authorizedEmails: cleanEmails,
        passwordHash,
        playbackMode: playbackMode ?? "sequential",
        jingleMode: jingleMode ?? "interval",
        jingleInterval: typeof jingleInterval === "number" && !isNaN(jingleInterval) ? jingleInterval : 3,
        jingleCount: typeof jingleCount === "number" && !isNaN(jingleCount) ? jingleCount : 1,
        voiceoverCount: typeof voiceoverCount === "number" && !isNaN(voiceoverCount) ? voiceoverCount : 1,
        jingleIntervalSeconds: typeof jingleIntervalSeconds === "number" && !isNaN(jingleIntervalSeconds) ? jingleIntervalSeconds : 900,
      })
      .returning();

    // Automatically create a default active playlist for the new client so it's immediately ready
    try {
      await db.insert(playlistsTable).values({
        name: "Playlist Principal",
        clientId: client.id,
        playbackMode: client.playbackMode as "sequential" | "shuffle",
        active: true,
      });
    } catch (plErr) {
      req.log.warn({ err: plErr }, "Não foi possível criar playlist padrão automática");
    }

    res.status(201).json({ ...client, deviceCount: 0, mediaCount: 0 });
  } catch (err: any) {
    req.log.error({ err }, "Erro ao criar cliente");
    if (err?.code === "23505") {
      res.status(400).json({ error: "Bad Request", message: "Email já cadastrado" });
      return;
    }
    res.status(500).json({ error: "Internal Server Error", message: err?.message || "Erro interno ao cadastrar cliente" });
  }
});

router.get("/clients/:clientId", requireAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.params["clientId"] as string);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Bad Request", message: "ID de cliente inválido" });
      return;
    }
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
    if (!client) {
      res.status(404).json({ error: "Not Found", message: "Cliente não encontrado" });
      return;
    }
    const [{ cnt: deviceCount }] = await db.select({ cnt: count(devicesTable.id) }).from(devicesTable).where(eq(devicesTable.clientId, clientId));
    const [{ cnt: mediaCount }] = await db.select({ cnt: count(mediaTable.id) }).from(mediaTable).where(eq(mediaTable.clientId, clientId));
    res.json({ ...client, deviceCount, mediaCount });
  } catch (err: any) {
    req.log.error({ err }, "Erro ao buscar cliente");
    res.status(500).json({ error: "Internal Server Error", message: "Erro ao buscar dados do cliente" });
  }
});

router.put("/clients/:clientId", requireAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.params["clientId"] as string);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Bad Request", message: "ID de cliente inválido" });
      return;
    }
    const { name, email, masterEmail, playbackMode, jingleMode, jingleInterval, jingleCount, voiceoverCount, jingleIntervalSeconds, active, authorizedEmails } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined && email.trim()) updates.email = email.trim().toLowerCase();
    if (masterEmail !== undefined && masterEmail.trim()) updates.masterEmail = masterEmail.trim().toLowerCase();
    if (authorizedEmails !== undefined) updates.authorizedEmails = sanitizeEmails(authorizedEmails);
    if (playbackMode !== undefined) updates.playbackMode = playbackMode;
    if (jingleMode !== undefined) updates.jingleMode = jingleMode;
    if (jingleInterval !== undefined) updates.jingleInterval = jingleInterval;
    if (jingleCount !== undefined) updates.jingleCount = jingleCount;
    if (voiceoverCount !== undefined) updates.voiceoverCount = voiceoverCount;
    if (jingleIntervalSeconds !== undefined) updates.jingleIntervalSeconds = jingleIntervalSeconds;
    if (active !== undefined) updates.active = active;

    const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, clientId)).returning();
    if (!client) {
      res.status(404).json({ error: "Not Found", message: "Cliente não encontrado" });
      return;
    }
    const [{ cnt: deviceCount }] = await db.select({ cnt: count(devicesTable.id) }).from(devicesTable).where(eq(devicesTable.clientId, clientId));
    const [{ cnt: mediaCount }] = await db.select({ cnt: count(mediaTable.id) }).from(mediaTable).where(eq(mediaTable.clientId, clientId));
    res.json({ ...client, deviceCount, mediaCount });
  } catch (err: any) {
    req.log.error({ err }, "Erro ao atualizar cliente");
    if (err?.code === "23505") {
      res.status(400).json({ error: "Bad Request", message: "Email já cadastrado para outro cliente" });
      return;
    }
    res.status(500).json({ error: "Internal Server Error", message: "Erro ao atualizar cliente" });
  }
});

router.delete("/clients/:clientId", requireAdmin, async (req, res) => {
  try {
    const clientId = parseInt(req.params["clientId"] as string);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Bad Request", message: "ID de cliente inválido" });
      return;
    }

    // Clean up dependent records
    const clientPlaylists = await db.select({ id: playlistsTable.id }).from(playlistsTable).where(eq(playlistsTable.clientId, clientId));
    if (clientPlaylists.length > 0) {
      const plIds = clientPlaylists.map((p) => p.id);
      await db.delete(playlistItemsTable).where(inArray(playlistItemsTable.playlistId, plIds));
      await db.delete(playlistsTable).where(eq(playlistsTable.clientId, clientId));
    }
    await db.delete(devicesTable).where(eq(devicesTable.clientId, clientId));
    await db.delete(mediaTable).where(eq(mediaTable.clientId, clientId));
    await db.delete(clientsTable).where(eq(clientsTable.id, clientId));

    res.json({ success: true, message: "Cliente removido com sucesso" });
  } catch (err: any) {
    req.log.error({ err }, "Erro ao excluir cliente");
    res.status(500).json({ error: "Internal Server Error", message: "Erro ao excluir cliente" });
  }
});

export default router;

