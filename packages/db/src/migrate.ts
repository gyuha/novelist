import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./client";

const { sqlite, db } = createDb();
migrate(db, {
	migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
sqlite.close();
console.log("migrate: ok");
