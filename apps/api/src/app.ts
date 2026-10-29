import { type Db, sql } from "@novelist/db";
import type { HealthResponse } from "@novelist/shared";
import { Hono } from "hono";
import { sseResponse } from "./sse";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createApp(db: Db) {
	const app = new Hono().basePath("/api").get("/health", (c) => {
		const row = db.get<{ ok: 1 }>(sql`SELECT 1 AS ok`);
		return c.json<HealthResponse>({ status: "ok", db: row.ok });
	});

	if (process.env.ENABLE_TEST_ENDPOINTS === "1") {
		app.get("/test/sse", (c) =>
			sseResponse(c, async (stream) => {
				for (let id = 1; id <= 3; id++) {
					await stream.writeSSE({
						event: "tick",
						id: String(id),
						data: JSON.stringify({ id }),
					});
					if (id < 3) await sleep(300);
				}
			}),
		);
	}

	return app;
}

export type AppType = ReturnType<typeof createApp>;
