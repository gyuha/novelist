"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 48rem)";

function subscribe(onChange: () => void) {
	const media = window.matchMedia(QUERY);
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

/** True at the desktop breakpoint (design: width >= 48rem). */
export function useIsDesktop(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(QUERY).matches,
		() => true,
	);
}
