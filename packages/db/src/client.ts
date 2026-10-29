import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export function databasePath(): string {
	const path = process.env.DATABASE_PATH;
	if (!path) throw new Error("DATABASE_PATH is not set");
	return path;
}

export function createDb(path: string = databasePath()) {
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");
	return { sqlite, db: drizzle(sqlite) };
}

export type Db = ReturnType<typeof createDb>["db"];
