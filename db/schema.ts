import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), rosa: text("rosa").notNull().default(""),
});
export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  occupation: text("occupation").notNull().default(""), role: text("role").notNull().default("suspeito"),
  story: text("story").notNull().default(""), secrets: text("secrets").notNull().default(""),
  alibi: text("alibi").notNull().default(""), information: text("information").notNull().default(""),
});
export const players = sqliteTable("players", {
  id: text("id").primaryKey(), name: text("name").notNull(), phone: text("phone").notNull().unique(),
  characterId: text("character_id").unique().references(() => characters.id, { onDelete: "set null" }),
  lastSeen: integer("last_seen"),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(), playerId: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  expires: integer("expires").notNull(),
});
