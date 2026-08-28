import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  masterEmail: text("master_email").notNull(),
  // Additional pre-authorized emails: any device registering with one of these
  // emails is auto-approved for this client (same effect as masterEmail, but
  // allows multiple). Stored as a Postgres text[] column.
  authorizedEmails: text("authorized_emails").array().notNull().default([]),
  passwordHash: text("password_hash").notNull(),
  playbackMode: text("playback_mode").notNull().default("sequential"),
  // "ordered" | "interval" (a cada N musicas) | "time" (a cada N minutos interrompe musica)
  jingleMode: text("jingle_mode").notNull().default("interval"),
  jingleInterval: integer("jingle_interval").notNull().default(3),
  jingleCount: integer("jingle_count").notNull().default(1),
  voiceoverCount: integer("voiceover_count").notNull().default(1),
  jingleIntervalSeconds: integer("jingle_interval_seconds").notNull().default(900),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
