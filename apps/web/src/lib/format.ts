export function formatDateTime(epochMs: number): string {
	return new Date(epochMs).toLocaleString("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function formatTime(epochMs: number): string {
	return new Date(epochMs).toLocaleTimeString("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
	});
}
