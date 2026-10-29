import { z } from "zod";

export const healthResponseSchema = z.object({
	status: z.literal("ok"),
	db: z.literal(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
