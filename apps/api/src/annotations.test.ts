import { annotations } from "@novelist/db";
import type { Doc } from "@novelist/shared";
import { describe, expect, test } from "vitest";
import { setup } from "./test-utils";

type Part = string | { text: string; marks: string[] };
/** 문단 하나. 문자열은 평문, 객체는 주석 마크(id 목록)가 걸린 텍스트 */
const docOf = (...parts: Part[]): Doc => ({
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: parts.map((p) =>
				typeof p === "string"
					? { type: "text" as const, text: p }
					: {
							type: "text" as const,
							text: p.text,
							marks: p.marks.map((id) => ({
								type: "annotation" as const,
								attrs: { id },
							})),
						},
			),
		},
	],
});
const marked = (text: string, ...marks: string[]) => ({ text, marks });

async function world() {
	const s = await setup();
	const admin = await s.adminCookie();
	const me = await s.activeMember("me@example.com", admin);
	const other = await s.activeMember("other@example.com", admin);
	const { call, db } = s;
	const novel = (
		await call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title: "내 소설" },
		})
	).json;
	const chapter = (
		await call("POST", `/api/novels/${novel.id}/chapters`, {
			cookie: me.cookie,
			body: { title: "1화" },
		})
	).json;
	const chapterPath = `/api/novels/${novel.id}/chapters/${chapter.id}`;
	const annPath = `${chapterPath}/annotations`;
	const getChapter = async () =>
		(await call("GET", chapterPath, { cookie: me.cookie })).json;
	const save = (body: unknown, expectedUpdatedAt: number, cookie = me.cookie) =>
		call("PUT", `${chapterPath}/body`, {
			cookie,
			body: { body, expectedUpdatedAt },
		});
	const addAnnotation = (
		chapterBody: unknown,
		expectedUpdatedAt: number,
		markId = "m1",
		body = "주석 내용",
		cookie = me.cookie,
	) =>
		call("POST", annPath, {
			cookie,
			body: { markId, body, chapterBody, expectedUpdatedAt },
		});
	const list = async (qs = "") =>
		(await call("GET", `${annPath}${qs}`, { cookie: me.cookie })).json
			.annotations as {
			markId: string;
			state: string;
			quote: string;
			body: string;
			id: string;
		}[];
	return {
		...s,
		admin,
		me,
		other,
		novel,
		chapter,
		chapterPath,
		annPath,
		getChapter,
		save,
		addAnnotation,
		list,
		db,
	};
}

describe("주석 생성", () => {
	test("주석 생성 시 본문과 행이 한 번에 저장된다", async () => {
		const { addAnnotation, getChapter, list, chapter } = await world();
		const body = docOf("앞 ", marked("걸린 글", "m1"), " 뒤");
		const r = await addAnnotation(body, chapter.updatedAt);
		expect(r.status).toBe(201);
		expect(r.json.annotation).toMatchObject({
			chapterId: chapter.id,
			markId: "m1",
			body: "주석 내용",
			state: "anchored",
			quote: "걸린 글",
		});
		const saved = await getChapter();
		expect(saved.body).toEqual(body);
		expect(saved.updatedAt).toBe(r.json.updatedAt);
		expect(saved.updatedAt).toBeGreaterThan(chapter.updatedAt);
		expect(await list()).toHaveLength(1);
	});

	test("버전 불일치(409)면 본문도 행도 저장되지 않는다", async () => {
		const { addAnnotation, getChapter, list, chapter, save, clock } =
			await world();
		clock.advance(1000);
		const first = await save(docOf("다른 탭에서 저장"), chapter.updatedAt);
		expect(first.status).toBe(200);
		const r = await addAnnotation(
			docOf(marked("옛 버전 위의 글", "m1")),
			chapter.updatedAt,
		);
		expect(r.status).toBe(409);
		expect(r.json.code).toBe("version_conflict");
		expect(r.json.currentUpdatedAt).toBe(first.json.updatedAt);
		const saved = await getChapter();
		expect(saved.body).toEqual(docOf("다른 탭에서 저장"));
		expect(await list()).toHaveLength(0);
	});

	test("새 마크가 본문에 없으면 400이고 아무것도 저장되지 않는다", async () => {
		const { addAnnotation, getChapter, list, chapter } = await world();
		const r = await addAnnotation(docOf("마크 없음"), chapter.updatedAt);
		expect(r.status).toBe(400);
		expect((await getChapter()).updatedAt).toBe(chapter.updatedAt);
		expect(await list()).toHaveLength(0);
	});

	test("이미 있는 markId는 400", async () => {
		const { addAnnotation, getChapter, chapter } = await world();
		const first = await addAnnotation(
			docOf(marked("가", "m1"), " 나"),
			chapter.updatedAt,
		);
		const dup = await addAnnotation(
			docOf(marked("가", "m1"), " 나"),
			first.json.updatedAt,
		);
		expect(dup.status).toBe(400);
		expect((await getChapter()).updatedAt).toBe(first.json.updatedAt);
	});

	test("겹치는 주석(이미 주석이 걸린 범위를 포함한 선택)은 거부한다", async () => {
		const { addAnnotation, getChapter, list, chapter } = await world();
		const first = await addAnnotation(
			docOf("앞 ", marked("가운데", "m1"), " 뒤"),
			chapter.updatedAt,
		);
		const r = await addAnnotation(
			docOf("앞 ", marked("가운데", "m1", "m2"), " 뒤"),
			first.json.updatedAt,
			"m2",
		);
		expect(r.status).toBe(400);
		expect(r.json.code).toBe("validation_error");
		expect(r.json.reason).toBe("annotation_overlap");
		expect((await getChapter()).updatedAt).toBe(first.json.updatedAt);
		expect(await list()).toHaveLength(1);
		// 겹치지 않는 선택은 가능
		const ok = await addAnnotation(
			docOf("앞 ", marked("가운데", "m1"), " ", marked("뒤", "m2")),
			first.json.updatedAt,
			"m2",
		);
		expect(ok.status).toBe(201);
	});

	test("챕터 본문 1MB 초과는 413, 주석 본문이 비면 400", async () => {
		const { addAnnotation, chapter } = await world();
		const huge = docOf(marked("가".repeat(400_000), "m1"));
		expect((await addAnnotation(huge, chapter.updatedAt)).status).toBe(413);
		expect(
			(
				await addAnnotation(
					docOf(marked("가", "m1")),
					chapter.updatedAt,
					"m1",
					"  ",
				)
			).status,
		).toBe(400);
	});
});

describe("연결 상태 판정", () => {
	async function withAnnotation() {
		const w = await world();
		const created = await w.addAnnotation(
			docOf("앞 ", marked("걸린 글", "m1"), " 뒤"),
			w.chapter.updatedAt,
		);
		return { ...w, version: created.json.updatedAt as number };
	}

	test("마크를 지우고 저장하면 위치를 잃고 인용문은 남는다", async () => {
		const { save, list, version } = await withAnnotation();
		const r = await save(docOf("앞  뒤"), version);
		expect(r.status).toBe(200);
		const [a] = await list();
		expect(a).toMatchObject({ state: "orphaned", quote: "걸린 글" });
	});

	test("같은 마크가 스냅샷 복원으로 돌아오면 재연결된다", async () => {
		const { save, list, version, chapterPath, me, call, getChapter } =
			await withAnnotation();
		const snap = (
			await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json;
		const lost = await save(docOf("앞  뒤"), version);
		expect((await list())[0]?.state).toBe("orphaned");
		expect(lost.status).toBe(200);
		const restored = await call(
			"POST",
			`${chapterPath}/snapshots/${snap.id}/restore`,
			{ cookie: me.cookie },
		);
		expect(restored.status).toBe(200);
		expect((await list())[0]).toMatchObject({
			state: "anchored",
			quote: "걸린 글",
		});
		expect((await getChapter()).body).toEqual(
			docOf("앞 ", marked("걸린 글", "m1"), " 뒤"),
		);
	});

	test("본문 저장으로 마크가 돌아와도 재연결되고 연결된 동안 인용문이 갱신된다", async () => {
		const { save, list, version } = await withAnnotation();
		const lost = await save(docOf("앞 뒤"), version);
		expect((await list())[0]?.state).toBe("orphaned");
		const back = await save(
			docOf("앞 ", marked("고친 글", "m1"), " 뒤"),
			lost.json.updatedAt,
		);
		expect(back.status).toBe(200);
		expect((await list())[0]).toMatchObject({
			state: "anchored",
			quote: "고친 글",
		});
	});

	test("행 없는 주석 마크는 저장 시 본문에서 제거된다", async () => {
		const { save, getChapter, chapter, list } = await world();
		const r = await save(
			docOf("앞 ", marked("유령", "ghost"), " 뒤"),
			chapter.updatedAt,
		);
		expect(r.status).toBe(200);
		const saved = await getChapter();
		expect(saved.body).toEqual(docOf("앞 ", "유령", " 뒤"));
		expect(await list()).toHaveLength(0);
	});

	test("스냅샷 복원 때도 행 없는 마크는 제거된다", async () => {
		const { me, call, chapterPath, getChapter, addAnnotation, chapter, db } =
			await world();
		const created = await addAnnotation(
			docOf(marked("글", "m1")),
			chapter.updatedAt,
		);
		const snap = (
			await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json;
		db.delete(annotations).run(); // 주석 삭제 후
		expect(created.status).toBe(201);
		const restored = await call(
			"POST",
			`${chapterPath}/snapshots/${snap.id}/restore`,
			{ cookie: me.cookie },
		);
		expect(restored.status).toBe(200);
		expect(restored.json.body).toEqual(docOf("글"));
		expect((await getChapter()).body).toEqual(docOf("글"));
	});

	test("저장이 409면 연결 상태도 바뀌지 않는다", async () => {
		const { save, list, version } = await withAnnotation();
		const r = await save(docOf("마크 없는 본문"), version - 1);
		expect(r.status).toBe(409);
		expect((await list())[0]?.state).toBe("anchored");
	});
});

describe("주석 목록·수정·삭제", () => {
	test("상태 필터로 목록을 거른다", async () => {
		const { addAnnotation, save, list, chapter } = await world();
		const a = await addAnnotation(
			docOf(marked("하나", "m1"), " ", marked("둘", "m2")),
			chapter.updatedAt,
			"m1",
		);
		// 두 번째 주석은 m2 마크가 이미 본문에 있으므로 같은 본문으로 생성
		const b = await addAnnotation(
			docOf(marked("하나", "m1"), " ", marked("둘", "m2")),
			a.json.updatedAt,
			"m2",
			"둘째 주석",
		);
		expect(b.status).toBe(201);
		await save(docOf(marked("하나", "m1"), " 둘"), b.json.updatedAt);
		expect((await list()).map((x) => x.markId).sort()).toEqual(["m1", "m2"]);
		expect((await list("?state=anchored")).map((x) => x.markId)).toEqual([
			"m1",
		]);
		expect((await list("?state=orphaned")).map((x) => x.markId)).toEqual([
			"m2",
		]);
	});

	test("주석 본문을 수정한다", async () => {
		const { addAnnotation, call, annPath, me, chapter, list } = await world();
		const a = await addAnnotation(docOf(marked("글", "m1")), chapter.updatedAt);
		const r = await call("PATCH", `${annPath}/${a.json.annotation.id}`, {
			cookie: me.cookie,
			body: { body: "고친 주석" },
		});
		expect(r.status).toBe(200);
		expect(r.json.body).toBe("고친 주석");
		expect((await list())[0]?.body).toBe("고친 주석");
		expect(
			(
				await call("PATCH", `${annPath}/${a.json.annotation.id}`, {
					cookie: me.cookie,
					body: { body: "" },
				})
			).status,
		).toBe(400);
	});

	test("주석을 삭제하면 행이 지워지고 마크는 다음 저장 때 본문에서 제거된다", async () => {
		const {
			addAnnotation,
			call,
			annPath,
			me,
			chapter,
			list,
			save,
			getChapter,
		} = await world();
		const a = await addAnnotation(docOf(marked("글", "m1")), chapter.updatedAt);
		const del = await call("DELETE", `${annPath}/${a.json.annotation.id}`, {
			cookie: me.cookie,
		});
		expect(del.status).toBe(204);
		expect(await list()).toHaveLength(0);
		const r = await save(docOf(marked("글", "m1")), a.json.updatedAt);
		expect(r.status).toBe(200);
		expect((await getChapter()).body).toEqual(docOf("글"));
		expect(
			(
				await call("DELETE", `${annPath}/${a.json.annotation.id}`, {
					cookie: me.cookie,
				})
			).status,
		).toBe(404);
	});

	test("다른 회원의 주석은 목록·생성·수정·삭제 모두 404이다", async () => {
		const { addAnnotation, call, annPath, other, me, chapter, list } =
			await world();
		const a = await addAnnotation(docOf(marked("글", "m1")), chapter.updatedAt);
		const id = a.json.annotation.id;
		const o = { cookie: other.cookie };
		expect((await call("GET", annPath, o)).status).toBe(404);
		expect(
			(
				await addAnnotation(
					docOf(marked("글", "m9")),
					a.json.updatedAt,
					"m9",
					"x",
					other.cookie,
				)
			).status,
		).toBe(404);
		expect(
			(
				await call("PATCH", `${annPath}/${id}`, {
					...o,
					body: { body: "탈취" },
				})
			).status,
		).toBe(404);
		expect((await call("DELETE", `${annPath}/${id}`, o)).status).toBe(404);
		expect((await list())[0]?.body).toBe("주석 내용");
		expect(me.id).not.toBe(other.id);
	});
});

describe("내보내기", () => {
	test("toPlainText·내보내기에 주석은 출력되지 않는다", async () => {
		const { addAnnotation, app, novel, me, chapter } = await world();
		await addAnnotation(
			docOf("앞 ", marked("걸린 글", "m1"), " 뒤"),
			chapter.updatedAt,
			"m1",
			"비밀 주석 내용",
		);
		const exported = async (format: string) => {
			const res = await app.request(
				`/api/novels/${novel.id}/export?format=${format}`,
				{ headers: { Cookie: me.cookie } },
			);
			expect(res.status).toBe(200);
			return res.text();
		};
		for (const format of ["txt", "md"]) {
			const text = await exported(format);
			expect(text).toContain("앞 걸린 글 뒤");
			expect(text).not.toContain("비밀 주석 내용");
			expect(text).not.toContain("annotation");
			expect(text).not.toContain("m1");
		}
	});
});
