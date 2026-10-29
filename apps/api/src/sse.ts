import type { Context } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";

// no-transform: 압축 미들웨어(Next.js rewrites 포함)가 스트림을 버퍼링하지 않게 한다.
export function sseResponse(
	c: Context,
	cb: (stream: SSEStreamingApi) => Promise<void>,
) {
	const res = streamSSE(c, cb);
	res.headers.set("Cache-Control", "no-cache, no-transform");
	res.headers.set("X-Accel-Buffering", "no");
	return res;
}
