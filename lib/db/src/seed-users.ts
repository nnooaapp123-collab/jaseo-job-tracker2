import { db, usersTable, writersTable, editorsTable } from "./index.js";
import bcrypt from "bcryptjs";

const DEFAULT_PASSWORD = "jaseo12";

async function seedUsers() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Check if users already exist
  const existing = await db.select().from(usersTable);
  if (existing.length > 0) {
    console.log(`✓ Users already seeded (${existing.length} users found). Skipping.`);
    return;
  }

  const writers = await db.select().from(writersTable);
  const editors = await db.select().from(editorsTable);

  const usersToInsert = [];

  // Admin user
  usersToInsert.push({
    username: "admin",
    role: "admin" as const,
    passwordHash: hash,
    writerId: null,
    editorId: null,
  });

  // CS user
  usersToInsert.push({
    username: "cs",
    role: "cs" as const,
    passwordHash: hash,
    writerId: null,
    editorId: null,
  });

  // Writers — use their name as username (lowercase, no spaces)
  for (const writer of writers) {
    usersToInsert.push({
      username: writer.name.toLowerCase().replace(/\s+/g, "."),
      role: "penulis" as const,
      passwordHash: hash,
      writerId: writer.id,
      editorId: null,
    });
  }

  // Editors — use their name as username
  for (const editor of editors) {
    usersToInsert.push({
      username: editor.name.toLowerCase().replace(/\s+/g, "."),
      role: "editor" as const,
      passwordHash: hash,
      writerId: null,
      editorId: editor.id,
    });
  }

  for (const u of usersToInsert) {
    await db.insert(usersTable).values(u).onConflictDoNothing();
    console.log(`  + ${u.username} (${u.role})`);
  }

  console.log(`✓ Seeded ${usersToInsert.length} users with password: ${DEFAULT_PASSWORD}`);
}

seedUsers()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
