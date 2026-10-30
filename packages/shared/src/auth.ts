import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
// 문자 조합 요구 없음. 길이만 본다.
export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH)
	.max(PASSWORD_MAX_LENGTH);

export const userRoleSchema = z.enum(["member", "admin"]);
export const userStatusSchema = z.enum(["pending", "active", "suspended"]);
export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;

// 요청
export const signupRequestSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
});
// 로그인은 길이 규칙을 적용하지 않는다(규칙 변경 전 비밀번호도 통과해야 함).
export const loginRequestSchema = z.object({
	email: emailSchema,
	password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export const changePasswordRequestSchema = z.object({
	currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
	newPassword: passwordSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

// 응답
export const meResponseSchema = z.object({
	id: z.string(),
	email: z.string(),
	role: userRoleSchema,
	status: userStatusSchema,
	mustChangePassword: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const adminMemberSchema = z.object({
	id: z.string(),
	email: z.string(),
	role: userRoleSchema,
	status: userStatusSchema,
	createdAt: z.number(),
	approvedAt: z.number().nullable(),
});
export const adminMemberListResponseSchema = z.object({
	members: z.array(adminMemberSchema),
});
export const resetPasswordResponseSchema = z.object({
	temporaryPassword: z.string(),
});
export type AdminMember = z.infer<typeof adminMemberSchema>;
export type AdminMemberListResponse = z.infer<
	typeof adminMemberListResponseSchema
>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

// 에러: 웹은 code로 메시지를 고른다. message는 서버 기본 문구(한국어).
export const apiErrorCodes = [
	"validation_error",
	"invalid_credentials",
	"too_many_attempts",
	"account_suspended",
	"email_taken",
	"unauthorized",
	"pending_approval",
	"password_change_required",
	"forbidden",
	"invalid_origin",
	"not_found",
	"invalid_current_password",
	"admin_target_forbidden",
	"invalid_state",
	"payload_too_large",
	"version_conflict",
] as const;
export const apiErrorCodeSchema = z.enum(apiErrorCodes);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export const apiErrorSchema = z.object({
	code: apiErrorCodeSchema,
	message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
