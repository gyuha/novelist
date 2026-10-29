import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client";

export function runMigrations(db: Db) {
	migrate(db, {
		migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
	});
}
