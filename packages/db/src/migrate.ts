import { createDb } from "./client";
import { runMigrations } from "./migrations";

const { sqlite, db } = createDb();
runMigrations(db);
sqlite.close();
console.log("migrate: ok");
