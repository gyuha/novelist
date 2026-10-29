import { createDb } from "@novelist/db";
import { healthResponseSchema } from "@novelist/shared";
import { expect, test } from "vitest";
import { createApp } from "./app";

test("GET /api/health returns the shared schema", async () => {
	const { db } = createDb(":memory:");
	const res = await createApp(db).request("/api/health");
	expect(res.status).toBe(200);
	expect(healthResponseSchema.parse(await res.json())).toEqual({
		status: "ok",
		db: 1,
	});
});

test("SSE test endpoint disables proxy buffering and transforms", async () => {
	process.env.ENABLE_TEST_ENDPOINTS = "1";
	try {
		const { db } = createDb(":memory:");
		const res = await createApp(db).request("/api/test/sse");
		expect(res.headers.get("Content-Type")).toContain("text/event-stream");
		expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
		expect(res.headers.get("X-Accel-Buffering")).toBe("no");
		await res.text();
	} finally {
		delete process.env.ENABLE_TEST_ENDPOINTS;
	}
});
