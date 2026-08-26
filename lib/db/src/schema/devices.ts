import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  lastSeen: timestamp("last_seen"),
  currentMediaId: integer("current_media_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
