"use client";

import { type MeResponse, meResponseSchema } from "@novelist/shared";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { api, errorCode, request } from "./api";

type AuthState =
	| { status: "loading" }
	| { status: "error" }
	| { status: "ready"; me: MeResponse | null };

type AuthContextValue = {
	state: AuthState;
	/** Re-reads /auth/me. Resolves with the fresh value (null = signed out). */
	refresh: () => Promise<MeResponse | null>;
	setMe: (me: MeResponse | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>({ status: "loading" });

	const refresh = useCallback(async () => {
		try {
			const res = await request(api.api.auth.me.$get());
			const me = meResponseSchema.parse(await res.json());
			setState({ status: "ready", me });
			return me;
		} catch (error) {
			if (errorCode(error) === "unauthorized") {
				setState({ status: "ready", me: null });
				return null;
			}
			setState({ status: "error" });
			throw error;
		}
	}, []);

	const setMe = useCallback(
		(me: MeResponse | null) => setState({ status: "ready", me }),
		[],
	);

	useEffect(() => {
		refresh().catch(() => {});
	}, [refresh]);

	const value = useMemo(
		() => ({ state, refresh, setMe }),
		[state, refresh, setMe],
	);
	return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
	const value = useContext(AuthContext);
	if (!value) throw new Error("useAuth must be used inside AuthProvider");
	return value;
}

/** For pages that only render once the shell has confirmed a signed-in user. */
export function useMe(): MeResponse {
	const { state } = useAuth();
	if (state.status !== "ready" || !state.me) {
		throw new Error("useMe requires a signed-in user");
	}
	return state.me;
}
