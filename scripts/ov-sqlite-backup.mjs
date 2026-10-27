// Run inside the app container: node /app/scripts/ov-sqlite-backup.mjs /data/backups/name.sqlite
import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const target = process.argv[2];
if (!target)
  throw new Error("Pass an absolute destination path on the persistent volume");
const source = path.join(process.env.DATA_DIR || "/data", "db.db");
if (!path.isAbsolute(target) || path.resolve(target) === path.resolve(source))
  throw new Error("Use a separate absolute destination path");
await mkdir(path.dirname(target), { recursive: true });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(target);
  const check = new Database(target, { readonly: true });
  try {
    if (check.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("Backup integrity check failed");
  } finally {
    check.close();
  }
  console.log("Consistent SQLite backup complete:", target);
} finally {
  db.close();
}
