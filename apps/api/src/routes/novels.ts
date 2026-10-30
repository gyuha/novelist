import { and, asc, chapters, type Db, desc, eq, novels } from "@novelist/db";
import {
	createNovelRequestSchema,
	type Doc,
	exportQuerySchema,
	type Novel,
	type NovelListResponse,
	updateNovelRequestSchema,
} from "@novelist/shared";
import { type Context, Hono } from "hono";
import { fail } from "../errors";
import {
	buildNovelExport,
	contentDisposition,
	exportFilename,
} from "../export";
import type { AppEnv } from "../middleware";
import { validateJson, validateQuery } from "../validate";

type NovelRow = typeof novels.$inferSelect;

export const toNovel = (n: NovelRow): Novel => ({
	id: n.id,
	title: n.title,
	description: n.description,
	createdAt: n.createdAt,
	updatedAt: n.updatedAt,
});

/** 로그인한 회원의 소설만 찾는다. 남의 소설과 없는 소설은 구분하지 않는다. */
export const findNovel = (db: Db, c: Context<AppEnv>, novelId: string) =>
	db
		.select()
		.from(novels)
		.where(
			and(
				eq(novels.id, novelId),
				eq(
					novels.userId,
					(c.var.auth as NonNullable<typeof c.var.auth>).user.id,
				),
			),
		)
		.get();

export function novelRoutes(db: Db, now: () => number) {
	return new Hono<AppEnv>()
		.get("/", (c) => {
			const userId = (c.var.auth as NonNullable<typeof c.var.auth>).user.id;
			const rows = db
				.select()
				.from(novels)
				.where(eq(novels.userId, userId))
				.orderBy(desc(novels.updatedAt), desc(novels.createdAt))
				.all();
			return c.json<NovelListResponse>({ novels: rows.map(toNovel) }, 200);
		})
		.post("/", validateJson(createNovelRequestSchema), (c) => {
			const { title, description } = c.req.valid("json");
			const t = now();
			const row: NovelRow = {
				id: crypto.randomUUID(),
				userId: (c.var.auth as NonNullable<typeof c.var.auth>).user.id,
				title,
				description: description || null,
				createdAt: t,
				updatedAt: t,
			};
			db.insert(novels).values(row).run();
			return c.json(toNovel(row), 201);
		})
		.get("/:novelId", (c) => {
			const novel = findNovel(db, c, c.req.param("novelId"));
			return novel ? c.json(toNovel(novel), 200) : fail(c, 404, "not_found");
		})
		.patch("/:novelId", validateJson(updateNovelRequestSchema), (c) => {
			const novel = findNovel(db, c, c.req.param("novelId"));
			if (!novel) return fail(c, 404, "not_found");
			const { title, description } = c.req.valid("json");
			const updated = db
				.update(novels)
				.set({
					...(title !== undefined && { title }),
					...(description !== undefined && {
						description: description || null,
					}),
					updatedAt: now(),
				})
				.where(eq(novels.id, novel.id))
				.returning()
				.get();
			return c.json(toNovel(updated), 200);
		})
		.delete("/:novelId", (c) => {
			const novel = findNovel(db, c, c.req.param("novelId"));
			if (!novel) return fail(c, 404, "not_found");
			db.delete(novels).where(eq(novels.id, novel.id)).run(); // chapters·snapshots는 ON DELETE CASCADE
			return c.body(null, 204);
		})
		.get("/:novelId/export", validateQuery(exportQuerySchema), (c) => {
			const novel = findNovel(db, c, c.req.param("novelId"));
			if (!novel) return fail(c, 404, "not_found");
			const { format } = c.req.valid("query");
			const rows = db
				.select()
				.from(chapters)
				.where(eq(chapters.novelId, novel.id))
				.orderBy(asc(chapters.position))
				.all();
			const text = buildNovelExport(
				format,
				novel,
				rows.map((r) => ({ title: r.title, body: JSON.parse(r.body) as Doc })),
			);
			return c.body(text, 200, {
				"Content-Type":
					format === "md"
						? "text/markdown; charset=utf-8"
						: "text/plain; charset=utf-8",
				"Content-Disposition": contentDisposition(
					exportFilename(novel.title, format),
				),
			});
		});
}
