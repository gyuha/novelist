"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./api";

type ListState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

/** Loads once on mount and again on reload(). */
export function useList<T>(load: () => Promise<T>) {
	const [state, setState] = useState<ListState<T>>({ status: "loading" });
	const loadRef = useRef(load);
	loadRef.current = load;

	const reload = useCallback(async () => {
		try {
			setState({ status: "ready", data: await loadRef.current() });
		} catch (error) {
			setState({ status: "error", message: errorText(error) });
		}
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	return { state, reload };
}
