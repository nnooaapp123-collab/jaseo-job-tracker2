import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Tabel sesi dipakai oleh connect-pg-simple dan dibuat saat API mulai.
// Dicantumkan di schema agar Drizzle tidak menganggapnya tabel asing yang harus dihapus.
export const sessionTable = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);
