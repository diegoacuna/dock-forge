import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/client/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.DATABASE_URL ??= `file:${path.resolve(__dirname, "..", "dev.db")}`;

declare global {
  // eslint-disable-next-line no-var
  var __dockforgePrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__dockforgePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dockforgePrisma = prisma;
}

export * from "../generated/client/client";
