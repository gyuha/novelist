import { annotations, chapters, memos } from "@novelist/db";
import { type Doc, MEMO_BODY_MAX_BYTES } from "@novelist/shared";
import { describe, expect, test } from "vitest";
import { setup } from "./test-utils";

const docOf = (text: string): Doc => ({
	type: "doc",
	content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function world() {
	const s = await setup();
	const admin = await s.adminCookie();
	const me = await s.activeMember("me@example.com", admin);
	const other = await s.activeMember("other@example.com", admin);
	const { call } = s;
	const novel = (
		await call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title: "내 소설" },
		})
	).json;
	const novel2 = (
		await call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title: "둘째 소설" },
		})
	).json;
	const chapter = (
		await call("POST", `/api/novels/${novel.id}/chapters`, {
			cookie: me.cookie,
			body: { title: "1화" },
		})
	).json;
	const chapter2 = (
		await call("POST", `/api/novels/${novel2.id}/chapters`, {
			cookie: me.cookie,
			body: { title: "1화" },
		})
	).json;
	const otherNovel = (
		await call("POST", "/api/novels", {
			cookie: other.cookie,
			body: { title: "남의 소설" },
		})
	).json;
	const otherChapter = (
		await call("POST", `/api/novels/${otherNovel.id}/chapters`, {
			cookie: other.cookie,
			body: { title: "남의 1화" },
		})
	).json;
	const create = (body: unknown, cookie = me.cookie) =>
		call("POST", "/api/memos", { cookie, body });
	const patch = (id: string, body: unknown, cookie = me.cookie) =>
		call("PATCH", `/api/memos/${id}`, { cookie, body });
	return {
		...s,
		admin,
		me,
		other,
		novel,
		novel2,
		chapter,
		chapter2,
		otherNovel,
		otherChapter,
		create,
		patch,
	};
}

describe("메모 생성·조회", () => {
	test("자유·소설·챕터 메모를 만들고 기본값(빈 본문, 제목 없음, AI 참고 꺼짐)을 돌려준다", async () => {
		const { create, call, me, novel, chapter } = await world();
		const free = await create({ kind: "free" });
		expect(free.status).toBe(201);
		expect(free.json).toMatchObject({
			kind: "free",
			novelId: null,
			chapterId: null,
			title: null,
			aiReference: false,
			body: { type: "doc", content: [{ type: "paragraph" }] },
		});
		const nm = await create({
			kind: "novel",
			novelId: novel.id,
			title: "세계관",
			body: docOf("내용"),
			aiReference: true,
		});
		expect(nm.status).toBe(201);
		expect(nm.json).toMatchObject({
			kind: "novel",
			novelId: novel.id,
			chapterId: null,
			title: "세계관",
			aiReference: true,
			body: docOf("내용"),
		});
		// novelId는 생략해도 챕터에서 채워진다
		const cm = await create({ kind: "chapter", chapterId: chapter.id });
		expect(cm.status).toBe(201);
		expect(cm.json).toMatchObject({
			kind: "chapter",
			novelId: novel.id,
			chapterId: chapter.id,
		});
		const got = await call("GET", `/api/memos/${cm.json.id}`, {
			cookie: me.cookie,
		});
		expect(got.json).toEqual(cm.json);
	});

	test("제목은 공백을 다듬고 빈 제목은 null, 200자 초과는 400", async () => {
		const { create } = await world();
		expect((await create({ kind: "free", title: "  제목  " })).json.title).toBe(
			"제목",
		);
		expect(
			(await create({ kind: "free", title: "   " })).json.title,
		).toBeNull();
		expect(
			(await create({ kind: "free", title: "가".repeat(201) })).status,
		).toBe(400);
	});
});

describe("메모 종류-소속 검증", () => {
	test("메모 종류-소속 불일치는 400이다", async () => {
		const { create, novel, chapter, novel2 } = await world();
		const bad: unknown[] = [
			{ kind: "free", novelId: novel.id },
			{ kind: "free", chapterId: chapter.id },
			{ kind: "novel" },
			{ kind: "novel", novelId: novel.id, chapterId: chapter.id },
			{ kind: "chapter", novelId: novel.id },
			// novelId가 챕터의 소설과 다름
			{ kind: "chapter", novelId: novel2.id, chapterId: chapter.id },
		];
		for (const b of bad)
			expect((await create(b)).status, JSON.stringify(b)).toBe(400);
	});

	test("소속 변경 시 종류-소속을 다시 검증한다", async () => {
		const { create, patch, novel, novel2, chapter } = await world();
		const m = (await create({ kind: "free" })).json;
		// free → novel
		const toNovel = await patch(m.id, {
			scope: { kind: "novel", novelId: novel.id },
			expectedUpdatedAt: m.updatedAt,
		});
		expect(toNovel.status).toBe(200);
		expect(toNovel.json).toMatchObject({ kind: "novel", novelId: novel.id });
		// novel → chapter (novelId는 챕터에서 채워짐)
		const toChapter = await patch(m.id, {
			scope: { kind: "chapter", chapterId: chapter.id },
			expectedUpdatedAt: toNovel.json.updatedAt,
		});
		expect(toChapter.json).toMatchObject({
			kind: "chapter",
			novelId: novel.id,
			chapterId: chapter.id,
		});
		// 불일치 소속은 400이고 메모는 그대로
		const bad = await patch(m.id, {
			scope: { kind: "chapter", novelId: novel2.id, chapterId: chapter.id },
			expectedUpdatedAt: toChapter.json.updatedAt,
		});
		expect(bad.status).toBe(400);
		const bad2 = await patch(m.id, {
			scope: { kind: "novel" },
			expectedUpdatedAt: toChapter.json.updatedAt,
		});
		expect(bad2.status).toBe(400);
		// chapter → free: 소속이 지워진다
		const toFree = await patch(m.id, {
			scope: { kind: "free" },
			expectedUpdatedAt: toChapter.json.updatedAt,
		});
		expect(toFree.json).toMatchObject({
			kind: "free",
			novelId: null,
			chapterId: null,
		});
	});

	test("남의 소설·챕터로 메모를 만들거나 옮기면 404", async () => {
		const { create, patch, otherNovel, otherChapter } = await world();
		expect(
			(await create({ kind: "novel", novelId: otherNovel.id })).status,
		).toBe(404);
		expect(
			(await create({ kind: "chapter", chapterId: otherChapter.id })).status,
		).toBe(404);
		const m = (await create({ kind: "free" })).json;
		const moved = await patch(m.id, {
			scope: { kind: "novel", novelId: otherNovel.id },
			expectedUpdatedAt: m.updatedAt,
		});
		expect(moved.status).toBe(404);
	});
});

describe("메모 수정·삭제", () => {
	test("제목·본문·AI 참고를 수정하고 제목 null은 지운다", async () => {
		const { create, patch, call, me } = await world();
		const m = (await create({ kind: "free", title: "옛" })).json;
		const r = await patch(m.id, {
			title: "새",
			body: docOf("새 본문"),
			aiReference: true,
			expectedUpdatedAt: m.updatedAt,
		});
		expect(r.status).toBe(200);
		expect(r.json).toMatchObject({
			title: "새",
			body: docOf("새 본문"),
			aiReference: true,
		});
		expect(r.json.updatedAt).toBeGreaterThan(m.updatedAt);
		const cleared = await patch(m.id, {
			title: null,
			expectedUpdatedAt: r.json.updatedAt,
		});
		expect(cleared.json.title).toBeNull();
		const del = await call("DELETE", `/api/memos/${m.id}`, {
			cookie: me.cookie,
		});
		expect(del.status).toBe(204);
		expect(
			(await call("GET", `/api/memos/${m.id}`, { cookie: me.cookie })).status,
		).toBe(404);
	});

	test("바꿀 항목이 없거나 expectedUpdatedAt이 없으면 400", async () => {
		const { create, patch } = await world();
		const m = (await create({ kind: "free" })).json;
		expect((await patch(m.id, { expectedUpdatedAt: m.updatedAt })).status).toBe(
			400,
		);
		expect((await patch(m.id, { title: "x" })).status).toBe(400);
	});

	test("메모 버전 불일치는 409 version_conflict이고 저장되지 않는다", async () => {
		const { create, patch, call, me, clock } = await world();
		const m = (await create({ kind: "free", body: docOf("처음") })).json;
		clock.advance(1000);
		const first = await patch(m.id, {
			body: docOf("탭1"),
			expectedUpdatedAt: m.updatedAt,
		});
		expect(first.status).toBe(200);
		// 다른 탭이 옛 버전으로 저장
		const second = await patch(m.id, {
			body: docOf("탭2"),
			expectedUpdatedAt: m.updatedAt,
		});
		expect(second.status).toBe(409);
		expect(second.json.code).toBe("version_conflict");
		expect(second.json.currentUpdatedAt).toBe(first.json.updatedAt);
		const got = await call("GET", `/api/memos/${m.id}`, { cookie: me.cookie });
		expect(got.json.body).toEqual(docOf("탭1"));
	});
});

describe("메모 본문 검증", () => {
	test("메모 본문의 주석 마크는 400이다", async () => {
		const { create, patch } = await world();
		const withMark = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "글",
							marks: [{ type: "annotation", attrs: { id: "m1" } }],
						},
					],
				},
			],
		};
		expect((await create({ kind: "free", body: withMark })).status).toBe(400);
		const m = (await create({ kind: "free" })).json;
		expect(
			(await patch(m.id, { body: withMark, expectedUpdatedAt: m.updatedAt }))
				.status,
		).toBe(400);
	});

	test("메모 본문 200KB 초과는 413이고 상한 이하는 저장된다", async () => {
		const { create, patch } = await world();
		const sized = (bytes: number) => {
			const base = JSON.stringify(docOf("")).length - 0;
			return docOf("가".repeat(Math.floor((bytes - base) / 3)));
		};
		const ok = sized(MEMO_BODY_MAX_BYTES - 100);
		expect(Buffer.byteLength(JSON.stringify(ok))).toBeLessThanOrEqual(
			MEMO_BODY_MAX_BYTES,
		);
		expect((await create({ kind: "free", body: ok })).status).toBe(201);
		const big = sized(MEMO_BODY_MAX_BYTES + 3000);
		const r = await create({ kind: "free", body: big });
		expect(r.status).toBe(413);
		expect(r.json.code).toBe("payload_too_large");
		const m = (await create({ kind: "free" })).json;
		const r2 = await patch(m.id, { body: big, expectedUpdatedAt: m.updatedAt });
		expect(r2.status).toBe(413);
	});
});

describe("메모 목록 범위 필터", () => {
	test("all/free/novel/chapter와 novelId·chapterId로 거르고 내 메모만 보인다", async () => {
		const { create, call, me, other, novel, novel2, chapter, clock } =
			await world();
		const mk = async (b: unknown) => {
			clock.advance(10);
			return (await create(b)).json.id as string;
		};
		const free = await mk({ kind: "free" });
		const n1 = await mk({ kind: "novel", novelId: novel.id });
		const n2 = await mk({ kind: "novel", novelId: novel2.id });
		const c1 = await mk({ kind: "chapter", chapterId: chapter.id });
		await create({ kind: "free" }, other.cookie);
		const list = async (qs: string) =>
			(
				(await call("GET", `/api/memos${qs}`, { cookie: me.cookie })).json
					.memos as { id: string }[]
			).map((m) => m.id);
		expect(await list("")).toEqual([c1, n2, n1, free]); // 최근 수정 순
		expect(await list("?scope=all")).toEqual([c1, n2, n1, free]);
		expect(await list("?scope=free")).toEqual([free]);
		expect(await list("?scope=novel")).toEqual([n2, n1]);
		expect(await list(`?scope=novel&novelId=${novel.id}`)).toEqual([n1]);
		expect(await list("?scope=chapter")).toEqual([c1]);
		expect(await list(`?scope=chapter&chapterId=${chapter.id}`)).toEqual([c1]);
		expect(await list(`?novelId=${novel.id}`)).toEqual([c1, n1]);
		expect(
			(await call("GET", "/api/memos?scope=x", { cookie: me.cookie })).status,
		).toBe(400);
	});
});

describe("메모 소유권", () => {
	test("다른 회원의 메모는 조회·수정·삭제 모두 404이고 변하지 않는다", async () => {
		const { create, patch, call, me, other } = await world();
		const m = (await create({ kind: "free", title: "내 것" })).json;
		const otherCookie = other.cookie;
		expect(
			(await call("GET", `/api/memos/${m.id}`, { cookie: otherCookie })).status,
		).toBe(404);
		expect(
			(
				await patch(
					m.id,
					{ title: "탈취", expectedUpdatedAt: m.updatedAt },
					otherCookie,
				)
			).status,
		).toBe(404);
		expect(
			(await call("DELETE", `/api/memos/${m.id}`, { cookie: otherCookie }))
				.status,
		).toBe(404);
		const mine = await call("GET", `/api/memos/${m.id}`, { cookie: me.cookie });
		expect(mine.json.title).toBe("내 것");
	});

	test("로그인 없이는 401", async () => {
		const { call } = await world();
		expect((await call("GET", "/api/memos")).status).toBe(401);
	});
});

describe("삭제 미리보기와 CASCADE", () => {
	test("챕터·소설 삭제 미리보기는 함께 지워질 메모 수를 돌려준다", async () => {
		const { create, call, me, other, novel, chapter, chapter2, novel2 } =
			await world();
		await create({ kind: "free" });
		await create({ kind: "novel", novelId: novel.id });
		await create({ kind: "chapter", chapterId: chapter.id });
		await create({ kind: "chapter", chapterId: chapter.id });
		await create({ kind: "novel", novelId: novel2.id });
		const ch = await call(
			"GET",
			`/api/novels/${novel.id}/chapters/${chapter.id}/delete-preview`,
			{ cookie: me.cookie },
		);
		expect(ch.status).toBe(200);
		expect(ch.json).toEqual({ memoCount: 2 });
		const empty = await call(
			"GET",
			`/api/novels/${novel2.id}/chapters/${chapter2.id}/delete-preview`,
			{ cookie: me.cookie },
		);
		expect(empty.json).toEqual({ memoCount: 0 });
		// 소설: 소설 메모 + 소속 챕터 메모
		const nv = await call("GET", `/api/novels/${novel.id}/delete-preview`, {
			cookie: me.cookie,
		});
		expect(nv.json).toEqual({ memoCount: 3 });
		// 남의 소설·챕터는 404
		expect(
			(
				await call("GET", `/api/novels/${novel.id}/delete-preview`, {
					cookie: other.cookie,
				})
			).status,
		).toBe(404);
		expect(
			(
				await call(
					"GET",
					`/api/novels/${novel.id}/chapters/${chapter.id}/delete-preview`,
					{ cookie: other.cookie },
				)
			).status,
		).toBe(404);
	});

	test("챕터·소설 삭제 시 메모·주석 CASCADE", async () => {
		const { create, call, db, me, novel, chapter } = await world();
		await create({ kind: "novel", novelId: novel.id });
		await create({ kind: "chapter", chapterId: chapter.id });
		await create({ kind: "free" });
		// 주석 행(마크가 본문에 없어도 행은 존재 — CASCADE만 확인)
		const t = 1;
		db.insert(annotations)
			.values({
				id: "a1",
				userId: me.id,
				chapterId: chapter.id,
				markId: "m1",
				body: "주석",
				quote: "인용",
				createdAt: t,
				updatedAt: t,
			})
			.run();
		const chapterDel = await call(
			"DELETE",
			`/api/novels/${novel.id}/chapters/${chapter.id}`,
			{ cookie: me.cookie },
		);
		expect(chapterDel.status).toBe(204);
		expect(db.select().from(annotations).all()).toHaveLength(0);
		expect(
			db
				.select()
				.from(memos)
				.all()
				.map((m) => m.kind)
				.sort(),
		).toEqual(["free", "novel"]);
		await call("DELETE", `/api/novels/${novel.id}`, { cookie: me.cookie });
		expect(
			db
				.select()
				.from(memos)
				.all()
				.map((m) => m.kind),
		).toEqual(["free"]);
		expect(db.select().from(chapters).all()).toHaveLength(2); // 둘째 소설·남의 소설의 챕터
	});
});
