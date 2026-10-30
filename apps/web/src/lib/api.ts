import type { AppType } from "@novelist/api";
import { type ApiErrorCode, apiErrorSchema } from "@novelist/shared";
import { hc } from "hono/client";

export const api = hc<AppType>("/");

export type RequestErrorCode = ApiErrorCode | "network" | "unknown";

export class ApiRequestError extends Error {
	constructor(
		readonly code: RequestErrorCode,
		readonly status: number,
		message: string,
		/** Set on 409 version_conflict: the server's current chapter version. */
		readonly currentUpdatedAt?: number,
		/** Set on 400 validation_error with a specific cause, e.g. "annotation_overlap". */
		readonly reason?: string,
	) {
		super(message);
	}
}

/** Resolves with the Response on 2xx; otherwise throws ApiRequestError. */
export async function request(pending: Promise<Response>): Promise<Response> {
	let res: Response;
	try {
		res = await pending;
	} catch {
		throw new ApiRequestError("network", 0, "network error");
	}
	if (res.ok) return res;
	const raw = await res.json().catch(() => null);
	const parsed = apiErrorSchema.safeParse(raw);
	if (parsed.success) {
		const extra = raw as { currentUpdatedAt?: unknown; reason?: unknown };
		throw new ApiRequestError(
			parsed.data.code,
			res.status,
			parsed.data.message,
			typeof extra.currentUpdatedAt === "number"
				? extra.currentUpdatedAt
				: undefined,
			typeof extra.reason === "string" ? extra.reason : undefined,
		);
	}
	throw new ApiRequestError("unknown", res.status, `HTTP ${res.status}`);
}

const messages: Record<RequestErrorCode, string> = {
	validation_error: "입력값이 올바르지 않습니다",
	invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다",
	too_many_attempts:
		"로그인 시도가 반복되어 15분 동안 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요",
	account_suspended: "이용이 정지되었습니다. 관리자에게 문의해 주세요",
	email_taken: "이미 가입을 신청했거나 사용 중인 이메일입니다",
	unauthorized: "로그인이 필요합니다",
	pending_approval: "관리자 승인을 기다리고 있습니다",
	password_change_required: "먼저 새 비밀번호를 설정해 주세요",
	forbidden: "접근 권한이 없습니다",
	invalid_origin:
		"허용되지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요",
	not_found: "대상을 찾을 수 없습니다. 목록을 새로고침해 주세요",
	invalid_current_password: "현재 비밀번호가 올바르지 않습니다",
	admin_target_forbidden: "관리자 계정에는 적용할 수 없습니다",
	invalid_state: "현재 상태에서는 처리할 수 없습니다. 목록을 새로고침해 주세요",
	payload_too_large:
		"본문 크기가 저장 한도(1MB)를 초과했습니다. 내용을 줄이거나 챕터를 나누어 다시 저장해 주세요",
	version_conflict: "다른 곳에서 이 챕터가 변경되어 저장하지 못했습니다",
	network: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요",
	unknown: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요",
};

const reasonMessages: Record<string, string> = {
	annotation_overlap:
		"이미 주석이 있는 범위와 겹쳐 추가할 수 없습니다. 다른 범위를 선택해 주세요",
};

export function errorText(error: unknown): string {
	const reason = errorReason(error);
	if (reason && reasonMessages[reason]) return reasonMessages[reason];
	return messages[error instanceof ApiRequestError ? error.code : "unknown"];
}

export function errorReason(error: unknown): string | undefined {
	return error instanceof ApiRequestError ? error.reason : undefined;
}

export function errorCode(error: unknown): RequestErrorCode {
	return error instanceof ApiRequestError ? error.code : "unknown";
}
