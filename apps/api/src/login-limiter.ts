const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Entry = { failures: number[]; blockedUntil: number };

/** 같은 이메일 15분 내 5회 실패 시 15분 차단. API 프로세스 메모리에만 기록한다. */
export class LoginLimiter {
	private entries = new Map<string, Entry>();

	constructor(private now: () => number) {}

	isBlocked(email: string): boolean {
		const entry = this.entries.get(email);
		if (!entry) return false;
		if (entry.blockedUntil > this.now()) return true;
		if (entry.blockedUntil > 0) this.entries.delete(email);
		return false;
	}

	recordFailure(email: string) {
		const now = this.now();
		const entry = this.entries.get(email) ?? { failures: [], blockedUntil: 0 };
		entry.failures = [
			...entry.failures.filter((t) => t > now - WINDOW_MS),
			now,
		];
		if (entry.failures.length >= MAX_FAILURES)
			entry.blockedUntil = now + WINDOW_MS;
		this.entries.set(email, entry);
	}

	reset(email: string) {
		this.entries.delete(email);
	}
}
