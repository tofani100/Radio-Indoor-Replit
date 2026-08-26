import { pgTable, serial, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist"),
  type: text("type").notNull().default("music"),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  duration: real("duration"),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  gain: real("gain").notNull().default(1.0),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({ id: true, createdAt: true });
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
