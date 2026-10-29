export function formatDate(epochMs: number): string {
	return new Date(epochMs).toLocaleDateString("ko-KR");
}
