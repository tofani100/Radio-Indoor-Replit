import { Router } from "express";
import multer from "multer";
import path from "path";
import { db, mediaTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import {
  uploadMediaBuffer,
  deleteMediaFile,
  getMediaFile,
} from "../lib/objectStorage";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".mp3", ".aac", ".wav", ".ogg", ".m4a", ".flac"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error("Only audio files are allowed"));
  },
});

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
};

function mediaUrl(filename: string) {
  return `/api/uploads/${filename}`;
}

function buildFilename(originalname: string): string {
  const ext = path.extname(originalname);
  const base = path.basename(originalname, ext).replace(/[^a-z0-9]/gi, "_");
  return `${Date.now()}_${base}${ext}`;
}

router.get("/media", requireAdmin, async (req, res) => {
  const { clientId, type } = req.query;
  const conditions = [];
  if (clientId) conditions.push(eq(mediaTable.clientId, parseInt(clientId as string)));
  if (type) conditions.push(eq(mediaTable.type, type as string));

  const media = await db
    .select()
    .from(mediaTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(mediaTable.createdAt);

  res.json(media.map((m) => ({ ...m, url: mediaUrl(m.filename) })));
});

router.post("/media", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Bad Request", message: "Audio file required" });
    return;
  }
  const { title, artist, type, clientId, gain } = req.body;
  if (!title || !clientId) {
    res.status(400).json({ error: "Bad Request", message: "title and clientId required" });
    return;
  }

  const filename = buildFilename(req.file.originalname);
  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  try {
    await uploadMediaBuffer(filename, req.file.buffer, contentType);
  } catch (err) {
    req.log.error({ err }, "Failed to upload media to object storage");
    res.status(500).json({ error: "Internal Server Error", message: "Falha ao salvar arquivo" });
    return;
  }

  const [media] = await db
    .insert(mediaTable)
    .values({
      title,
      artist: artist ?? null,
      type: type ?? "music",
      filename,
      filePath: `objstore://uploads/${filename}`,
      clientId: parseInt(clientId),
      gain: gain ? parseFloat(gain) : 1.0,
    })
    .returning();
  res.status(201).json({ ...media, url: mediaUrl(media.filename) });
});

router.post("/media/scan-folder", requireAdmin, async (_req, res) => {
  res.status(410).json({
    error: "Gone",
    message: "Importação por pasta foi descontinuada. Use o upload de arquivos.",
  });
});

router.post("/media/batch-delete", requireAdmin, async (req, res) => {
  const { mediaIds } = req.body as { mediaIds?: number[] };
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    res.status(400).json({ error: "Bad Request", message: "mediaIds array required" });
    return;
  }
  const items = await db.select().from(mediaTable).where(inArray(mediaTable.id, mediaIds));
  await Promise.all(
    items.map((m) =>
      deleteMediaFile(m.filename).catch((err: unknown) =>
        req.log.warn({ err, filename: m.filename }, "Failed to delete object"),
      ),
    ),
  );
  await db.delete(mediaTable).where(inArray(mediaTable.id, mediaIds));
  res.json({ deleted: items.length });
});

router.get("/media/:mediaId", requireAdmin, async (req, res) => {
  const mediaId = parseInt(req.params["mediaId"] as string);
  const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, mediaId)).limit(1);
  if (!media) {
    res.status(404).json({ error: "Not Found", message: "Media not found" });
    return;
  }
  res.json({ ...media, url: mediaUrl(media.filename) });
});

router.delete("/media/:mediaId", requireAdmin, async (req, res) => {
  const mediaId = parseInt(req.params["mediaId"] as string);
  const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, mediaId)).limit(1);
  if (!media) {
    res.status(404).json({ error: "Not Found", message: "Media not found" });
    return;
  }
  await deleteMediaFile(media.filename).catch((err: unknown) =>
    req.log.warn({ err, filename: media.filename }, "Failed to delete object"),
  );
  await db.delete(mediaTable).where(eq(mediaTable.id, mediaId));
  res.json({ success: true, message: "Media deleted" });
});

// Stream audio files from object storage with Range support so the
// browser <audio> element can seek inside the file.
router.get("/uploads/:filename", async (req, res) => {
  const filename = req.params["filename"] as string;
  const file = getMediaFile(filename);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).end();
      return;
    }
    const [metadata] = await file.getMetadata();
    const total = Number(metadata.size ?? 0);
    const ext = path.extname(filename).toLowerCase();
    const contentType = (metadata.contentType as string) || CONTENT_TYPES[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");

    const range = req.headers.range;
    if (range && total > 0) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : total - 1;
        if (start >= total || end >= total || start > end) {
          res.status(416).setHeader("Content-Range", `bytes */${total}`).end();
          return;
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.setHeader("Content-Length", String(end - start + 1));
        file.createReadStream({ start, end }).on("error", (err) => {
          req.log.error({ err, filename }, "Stream error");
          res.destroy(err);
        }).pipe(res);
        return;
      }
    }

    if (total > 0) res.setHeader("Content-Length", String(total));
    file.createReadStream().on("error", (err) => {
      req.log.error({ err, filename }, "Stream error");
      res.destroy(err);
    }).pipe(res);
  } catch (err) {
    req.log.error({ err, filename }, "Failed to serve media");
    if (!res.headersSent) res.status(500).end();
  }
});

export default router;
