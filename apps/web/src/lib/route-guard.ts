import type { MeResponse } from "@novelist/shared";

/** Landing page after sign-in. */
export const HOME_PATH = "/novels";

const PUBLIC_PATHS = ["/login", "/signup"];

export type ShellKind = "plain" | "simple" | "restricted" | "full";

/**
 * Where the current user must be sent from `pathname`, or null if the page may
 * render. Admin-only data is guarded separately inside /admin.
 */
export function redirectFor(
	me: MeResponse | null,
	pathname: string,
): string | null {
	if (!me || me.status === "suspended") {
		return PUBLIC_PATHS.includes(pathname) ? null : "/login";
	}
	if (me.status === "pending") {
		return pathname === "/pending" ? null : "/pending";
	}
	if (me.mustChangePassword) {
		return pathname === "/account/password" ? null : "/account/password";
	}
	if (PUBLIC_PATHS.includes(pathname) || pathname === "/pending") {
		return HOME_PATH;
	}
	return null;
}

export function shellKind(me: MeResponse | null): ShellKind {
	if (!me || me.status === "suspended") return "plain";
	if (me.status === "pending") return "simple";
	if (me.mustChangePassword) return "restricted";
	return "full";
}
