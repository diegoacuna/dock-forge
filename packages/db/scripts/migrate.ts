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

type SqlExecutor = {
  run: (sql: string) => void;
  listAppliedMigrations: () => string[];
};

const createCliExecutor = (): SqlExecutor => ({
  run: (sql) => {
    try {
      execFileSync("sqlite3", [dbPath, sql], {
        cwd: packageRoot,
        stdio: "inherit",
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "ENOENT") {
        throw new Error(
          "SQLite migrations require either Node's built-in sqlite module or the sqlite3 CLI. Upgrade to Node 22+ or install sqlite3.",
        );
      }

      throw error;
    }
  },
  listAppliedMigrations: () => {
    try {
      const appliedRows = execFileSync("sqlite3", [dbPath, "SELECT id FROM _dockforge_migrations;"], {
        cwd: packageRoot,
        encoding: "utf8",
      });

      return appliedRows
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "ENOENT") {
        throw new Error(
          "SQLite migrations require either Node's built-in sqlite module or the sqlite3 CLI. Upgrade to Node 22+ or install sqlite3.",
        );
      }

      throw error;
    }
  },
});

const createExecutor = async (): Promise<SqlExecutor> => {
  try {
    const sqlite = await import("node:sqlite");
    const database = new sqlite.DatabaseSync(dbPath);

    return {
      run: (sql) => {
        database.exec(sql);
      },
      listAppliedMigrations: () => {
        const statement = database.prepare("SELECT id FROM _dockforge_migrations;");
        return statement.all().map((row) => String((row as { id: string }).id));
      },
    };
  } catch (error) {
    const isUnsupportedNodeSqlite =
      error instanceof Error &&
      ("code" in error ? (error as Error & { code?: string }).code === "ERR_UNKNOWN_BUILTIN_MODULE" : false);

    if (!isUnsupportedNodeSqlite) {
      throw error;
    }

    return createCliExecutor();
  }
};

const executor = await createExecutor();

executor.run(`
CREATE TABLE IF NOT EXISTS _dockforge_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`);

const applied = new Set(executor.listAppliedMigrations());

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
  executor.run(sql);
  executor.run(`INSERT INTO _dockforge_migrations (id, applied_at) VALUES ('${migrationId}', datetime('now'));`);
  process.stdout.write(`Applied migration ${migrationId}\n`);
}
