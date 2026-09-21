import bcrypt from "bcryptjs";
import { db, usersTable, writersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_PASSWORD = "jaseo12";

/**
 * Pastikan semua writer/editor punya akun user.
 * Berjalan setiap server startup — aman dijalankan berulang kali (onConflictDoNothing).
 */
export async function autoSeedUsers(): Promise<void> {
  try {
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // 0. Hapus akun cs.jaseo lama (digantikan oleh penulis berperan CS)
    const deleted = await db.delete(usersTable).where(eq(usersTable.username, "cs.jaseo")).returning();
    if (deleted.length > 0) logger.info("Auto-seed: akun cs.jaseo dihapus");

    // 1. Pastikan akun Admin ada
    const baseUsers = [
      { username: "admin", role: "admin" as const, writerId: null, editorId: null },
    ];
    for (const u of baseUsers) {
      await db.insert(usersTable).values({ ...u, passwordHash: hash, plainPassword: DEFAULT_PASSWORD }).onConflictDoNothing();
    }

    // 2. Buat akun untuk setiap penulis yang belum punya akun
    const writers = await db.select().from(writersTable);
    for (const w of writers) {
      // Cek apakah sudah ada user yang terhubung ke writerId ini
      const [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.writerId, w.id))
        .limit(1);
      if (existing) {
        const nextEditorId = w.isAlsoEditor ? w.linkedEditorId ?? null : null;
        if (existing.editorId !== nextEditorId) {
          await db.update(usersTable).set({ editorId: nextEditorId }).where(eq(usersTable.id, existing.id));
        }
        continue;
      }

      const username = w.name.toLowerCase().replace(/\s+/g, ".");
      await db
        .insert(usersTable)
        .values({ username, passwordHash: hash, plainPassword: DEFAULT_PASSWORD, role: "penulis", writerId: w.id, editorId: w.isAlsoEditor ? w.linkedEditorId ?? null : null })
        .onConflictDoNothing();
      logger.info({ username, writerId: w.id }, "Auto-seed: akun penulis baru dibuat");
    }

    logger.info("Auto-seed selesai: semua akun diperiksa dan disinkronkan");
  } catch (err) {
    logger.error({ err }, "Auto-seed gagal");
  }
}
