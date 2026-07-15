import { copyFile, mkdir, readFile, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

async function loadDotEnv(filePath) {
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function sqlitePathFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) return null;
  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath) return null;
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), "prisma", rawPath);
}

const root = process.cwd();
await loadDotEnv(path.join(root, ".env"));

const databasePath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL?.trim() || "");
if (!databasePath) {
  console.error("Refusing to backup: DATABASE_URL is not a SQLite file URL.");
  process.exit(1);
}

await stat(databasePath);

const backupDir = process.env.SQLITE_BACKUP_DIR?.trim()
  ? path.resolve(process.env.SQLITE_BACKUP_DIR.trim())
  : path.resolve(path.dirname(databasePath), "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `${path.basename(databasePath)}.${timestamp}.bak`);

await mkdir(backupDir, { recursive: true });
await copyFile(databasePath, backupPath);

const backupStats = await stat(backupPath);
console.log(`${fileURLToPath(import.meta.url)} backed up ${backupStats.size} bytes to ${backupPath}`);
