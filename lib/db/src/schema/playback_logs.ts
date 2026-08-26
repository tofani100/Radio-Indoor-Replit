import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mediaTable } from "./media";
import { devicesTable } from "./devices";

export const playbackLogsTable = pgTable("playback_logs", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id").notNull().references(() => mediaTable.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").references(() => devicesTable.id, { onDelete: "set null" }),
  deviceUuid: text("device_uuid").notNull(),
  clientEmail: text("client_email").notNull(),
  playedAt: timestamp("played_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlaybackLogSchema = createInsertSchema(playbackLogsTable).omit({ id: true, createdAt: true });
export type InsertPlaybackLog = z.infer<typeof insertPlaybackLogSchema>;
export type PlaybackLog = typeof playbackLogsTable.$inferSelect;
