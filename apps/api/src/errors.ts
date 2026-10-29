import type { ApiErrorCode } from "@novelist/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const messages: Record<ApiErrorCode, string> = {
	validation_error: "입력값이 올바르지 않습니다.",
	invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
	too_many_attempts: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
	account_suspended: "정지된 계정입니다. 관리자에게 문의해 주세요.",
	email_taken: "이미 가입 신청된 이메일입니다.",
	unauthorized: "로그인이 필요합니다.",
	pending_approval: "관리자 승인을 기다리는 중입니다.",
	password_change_required: "먼저 새 비밀번호를 정해 주세요.",
	forbidden: "권한이 없습니다.",
	invalid_origin: "허용되지 않은 요청 출처입니다.",
	not_found: "대상을 찾을 수 없습니다.",
	invalid_current_password: "현재 비밀번호가 올바르지 않습니다.",
	admin_target_forbidden: "관리자 계정에는 적용할 수 없습니다.",
	invalid_state: "현재 상태에서는 처리할 수 없습니다.",
};

export function fail(
	c: Context,
	status: ContentfulStatusCode,
	code: ApiErrorCode,
) {
	return c.json({ code, message: messages[code] }, status);
}
