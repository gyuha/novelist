import type { Context } from "hono";
import { fail } from "./errors";

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");

/**
 * 요청 본문을 직접 읽어 문서 필드(bodyKey)가 maxBytes를 넘으면 413, JSON이 아니면 400을 돌려준다.
 * 문서 외 필드를 위한 여유(slackBytes)만 요청 전체 상한에 더한다. 형식 검증은 호출한 쪽이 한다.
 */
export async function readJsonWithDocLimit(
	c: Context,
	bodyKey: string,
	maxBytes: number,
	tooLargeMessage?: string,
	slackBytes = 4096,
): Promise<{ json: unknown } | { error: Response }> {
	const tooLarge = () =>
		fail(
			c,
			413,
			"payload_too_large",
			tooLargeMessage ? { message: tooLargeMessage } : {},
		);
	const text = await c.req.text();
	if (byteLength(text) > maxBytes + slackBytes) return { error: tooLarge() };
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return { error: fail(c, 400, "validation_error") };
	}
	const doc = (json as Record<string, unknown> | null)?.[bodyKey];
	if (doc !== undefined && byteLength(JSON.stringify(doc)) > maxBytes)
		return { error: tooLarge() };
	return { json };
}
