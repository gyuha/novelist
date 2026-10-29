import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, KEY_LENGTH, (err, key) =>
			err ? reject(err) : resolve(key),
		);
	});
}

// 저장 형식: scrypt$<salt base64>$<hash base64>
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await derive(password, salt);
	return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const [scheme, saltB64, hashB64] = stored.split("$");
	if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
	const expected = Buffer.from(hashB64, "base64");
	const actual = await derive(password, Buffer.from(saltB64, "base64"));
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// 임시 비밀번호: 영숫자·기호 혼동 없는 base64url 16자
export function generateTemporaryPassword(): string {
	return randomBytes(12).toString("base64url");
}
