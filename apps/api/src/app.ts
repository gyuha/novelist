import { type Db, sql } from "@novelist/db";
import type { HealthResponse } from "@novelist/shared";
import { Hono } from "hono";
import { LoginLimiter } from "./login-limiter";
import { type AppEnv, originCheck, sessionMiddleware } from "./middleware";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { chapterRoutes } from "./routes/chapters";
import { novelRoutes } from "./routes/novels";
import { sseResponse } from "./sse";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createApp(db: Db, opts: { now?: () => number } = {}) {
	const now = opts.now ?? Date.now;
	const limiter = new LoginLimiter(now);

	const app = new Hono<AppEnv>()
		.basePath("/api")
		.use(originCheck)
		.use(sessionMiddleware(db, now))
		.get("/health", (c) => {
			const row = db.get<{ ok: 1 }>(sql`SELECT 1 AS ok`);
			return c.json<HealthResponse>({ status: "ok", db: row.ok });
		})
		.route("/auth", authRoutes(db, now, limiter))
		.route("/admin", adminRoutes(db, now))
		.route("/novels", novelRoutes(db, now))
		.route("/novels", chapterRoutes(db, now));

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
