import { expect, test } from "@playwright/test";

test("home page reports a healthy API", async ({ page }) => {
	await page.goto("/login");
	await page.getByTestId("login-email").fill("admin@example.com");
	await page.getByTestId("login-password").fill("AdminPassword123!");
	await page.getByTestId("login-submit").click();
	await page.waitForURL("/novels");
	await page.goto("/");
	await expect(page.getByTestId("api-health")).toHaveText("API 정상");
});

test("SSE ticks arrive progressively through the web origin", async ({
	page,
}) => {
	await page.goto("/login");
	const result = await page.evaluate(async () => {
		const response = await fetch("/api/test/sse");
		if (!response.ok || !response.body) {
			throw new Error(`SSE request failed with status ${response.status}`);
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		const events: Array<{
			event: string;
			id: number;
			dataId: number;
			at: number;
		}> = [];
		let buffer = "";
		while (events.length < 3) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder
				.decode(value, { stream: true })
				.replaceAll("\r\n", "\n");
			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const block = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				const fields = Object.fromEntries(
					block.split("\n").map((line) => {
						const separator = line.indexOf(":");
						return [
							line.slice(0, separator),
							line.slice(separator + 1).trimStart(),
						];
					}),
				);
				const data = JSON.parse(fields.data) as { id: number };
				events.push({
					event: fields.event,
					id: Number(fields.id),
					dataId: data.id,
					at: performance.now(),
				});
				boundary = buffer.indexOf("\n\n");
			}
		}
		await reader.cancel();
		return {
			events,
			gaps: events.slice(1).map((event, index) => event.at - events[index].at),
			spread: events.length === 3 ? events[2].at - events[0].at : 0,
		};
	});
	process.stdout.write(
		`SSE_GAPS_MS=${result.gaps.map(Math.round).join(",")} SPREAD_MS=${Math.round(result.spread)}\n`,
	);
	expect(result.events).toHaveLength(3);
	expect(
		result.events.map(({ event, id, dataId }) => ({ event, id, dataId })),
	).toEqual([
		{ event: "tick", id: 1, dataId: 1 },
		{ event: "tick", id: 2, dataId: 2 },
		{ event: "tick", id: 3, dataId: 3 },
	]);
	expect(result.gaps.every((gap) => gap >= 150)).toBe(true);
	expect(result.spread).toBeGreaterThanOrEqual(400);
});
