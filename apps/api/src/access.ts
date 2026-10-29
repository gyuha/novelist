import type { ApiErrorCode, UserRole, UserStatus } from "@novelist/shared";

type Principal = {
	status: UserStatus;
	role: UserRole;
	mustChangePassword: boolean;
};

const PUBLIC = new Set([
	"GET /api/health",
	"GET /api/test/sse",
	"POST /api/auth/signup",
	"POST /api/auth/login",
]);
// 대기 회원·변경 필요 상태에서도 허용하는 API
const ALWAYS_FOR_SESSION = new Set([
	"GET /api/auth/me",
	"POST /api/auth/logout",
]);
const PASSWORD_CHANGE = "POST /api/auth/password";

/**
 * 상태별 접근 규칙. 이후 부분 계획의 API도 여기서 기본 거부(default deny)로 걸러지므로
 * 새 라우트는 이 함수를 고치지 않아도 규칙을 그대로 따른다.
 */
export function decideAccess(
	method: string,
	path: string,
	user: Principal | null,
): ApiErrorCode | null {
	const key = `${method} ${path}`;
	if (PUBLIC.has(key)) return null;
	if (!user) return "unauthorized";
	if (user.status === "suspended") return "account_suspended";
	if (ALWAYS_FOR_SESSION.has(key)) return null;
	if (user.status === "pending") return "pending_approval";
	if (key === PASSWORD_CHANGE) return null;
	if (user.mustChangePassword) return "password_change_required";
	if (path.startsWith("/api/admin/") && user.role !== "admin")
		return "forbidden";
	return null;
}
