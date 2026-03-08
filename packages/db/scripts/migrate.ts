import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const migrationsRoot = path.join(packageRoot, "prisma", "migrations");
const defaultDbPath = path.join(packageRoot, "dev.db");

const databaseUrl = process.env.DATABASE_URL ?? `file:${defaultDbPath}`;

if (!databaseUrl.startsWith("file:")) {
  throw new Error(`Only SQLite file DATABASE_URL values are supported by this migrator. Received: ${databaseUrl}`);
}

const rawDbTarget = databaseUrl.replace(/^file:/, "");
const dbPath = path.isAbsolute(rawDbTarget) ? rawDbTarget : path.resolve(packageRoot, rawDbTarget);

const runSql = (sql: string) => {
  execFileSync("sqlite3", [dbPath, sql], {
    cwd: packageRoot,
    stdio: "inherit",
  });
};

runSql(`
CREATE TABLE IF NOT EXISTS _dockforge_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`);

const appliedRows = execFileSync("sqlite3", [dbPath, "SELECT id FROM _dockforge_migrations;"], {
  cwd: packageRoot,
  encoding: "utf8",
});
const applied = new Set(appliedRows.split("\n").map((value) => value.trim()).filter(Boolean));

const migrationDirs = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const migrationId of migrationDirs) {
  if (applied.has(migrationId)) {
    continue;
  }

  const migrationFile = path.join(migrationsRoot, migrationId, "migration.sql");
  if (!existsSync(migrationFile)) {
    continue;
  }

  const sql = readFileSync(migrationFile, "utf8");
  runSql(sql);
  runSql(`INSERT INTO _dockforge_migrations (id, applied_at) VALUES ('${migrationId}', datetime('now'));`);
  process.stdout.write(`Applied migration ${migrationId}\n`);
}
