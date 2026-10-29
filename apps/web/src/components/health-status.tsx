"use client";

import { healthResponseSchema } from "@novelist/shared";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type State = "loading" | "ok" | "error";

export function HealthStatus() {
	const [state, setState] = useState<State>("loading");

	useEffect(() => {
		let cancelled = false;
		api.api.health
			.$get()
			.then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
			.then((body) => {
				const parsed = healthResponseSchema.safeParse(body);
				if (!cancelled) setState(parsed.success ? "ok" : "error");
			})
			.catch(() => {
				if (!cancelled) setState("error");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const text = {
		loading: "API 확인 중…",
		ok: "API 정상",
		error: "API에 연결하지 못했습니다",
	}[state];

	return (
		<p
			className="status-pill"
			data-state={state}
			data-testid="api-health"
			role="status"
		>
			{text}
		</p>
	);
}
