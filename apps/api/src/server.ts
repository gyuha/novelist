import { serve } from "@hono/node-server";
import { createDb } from "@novelist/db";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
const { db } = createDb();

serve({ fetch: createApp(db).fetch, port }, (info) => {
	console.log(`api listening on http://localhost:${info.port}`);
});
