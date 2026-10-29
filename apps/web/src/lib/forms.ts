import {
	emailSchema,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	passwordSchema,
} from "@novelist/shared";

export function emailError(value: string): string | undefined {
	if (!value.trim()) return "이메일을 입력해 주세요";
	return emailSchema.safeParse(value).success
		? undefined
		: "올바른 이메일 주소를 입력해 주세요";
}

export function newPasswordError(value: string): string | undefined {
	if (!value) return "비밀번호를 입력해 주세요";
	return passwordSchema.safeParse(value).success
		? undefined
		: `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자여야 합니다`;
}

export function requiredError(
	value: string,
	label: string,
): string | undefined {
	return value ? undefined : `${label}을(를) 입력해 주세요`;
}

export function confirmError(
	password: string,
	confirm: string,
): string | undefined {
	if (!confirm) return "비밀번호를 한 번 더 입력해 주세요";
	return password === confirm ? undefined : "비밀번호가 일치하지 않습니다";
}
