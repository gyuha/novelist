import { createDb, runMigrations } from "@novelist/db";
import { emailSchema, passwordSchema } from "@novelist/shared";
import { ensureAdmin } from "./seed";

const email = emailSchema.safeParse(process.env.ADMIN_EMAIL);
const password = passwordSchema.safeParse(process.env.ADMIN_PASSWORD);
if (!email.success || !password.success) {
	console.error(
		"seed:admin: ADMIN_EMAIL(이메일 형식)과 ADMIN_PASSWORD(10~128자)가 필요합니다.",
	);
	process.exit(1);
}

const { sqlite, db } = createDb();
runMigrations(db);
const result = await ensureAdmin(db, {
	email: email.data,
	password: password.data,
});
sqlite.close();
console.log(`seed:admin: ${result} ${email.data}`);
