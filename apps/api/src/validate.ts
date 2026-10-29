import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { fail } from "./errors";

export const validateJson = <T extends ZodType>(schema: T) =>
	zValidator("json", schema, (result, c) => {
		if (!result.success) return fail(c, 400, "validation_error");
	});
