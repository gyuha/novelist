import { chapterSnapshots } from "@novelist/db";
import {
	AUTO_SNAPSHOT_LIMIT,
	CHAPTER_BODY_MAX_BYTES,
	type Doc,
} from "@novelist/shared";
import { describe, expect, test } from "vitest";
import { setup } from "./test-utils";

const docOf = (text: string): Doc => ({
	type: "doc",
	content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** 활성 회원 한 명과 그 회원의 소설·챕터를 만들어 주는 테스트 도우미 */
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
	const addChapter = async (
		title: string,
		cookie = me.cookie,
		novelId = novel.id,
	) =>
		(
			await call("POST", `/api/novels/${novelId}/chapters`, {
				cookie,
				body: { title },
			})
		).json;
	const chapter = await addChapter("1화");
	const save = (
		body: unknown,
		expectedUpdatedAt: number,
		cookie = me.cookie,
		c = chapter,
	) =>
		call("PUT", `/api/novels/${novel.id}/chapters/${c.id}/body`, {
			cookie,
			body: { body, expectedUpdatedAt },
		});
	const chapterPath = `/api/novels/${novel.id}/chapters/${chapter.id}`;
	return {
		...s,
		admin,
		me,
		other,
		novel,
		chapter,
		addChapter,
		save,
		chapterPath,
	};
}

describe("접근 규칙", () => {
	test("비로그인은 소설 API에 401, 대기 회원은 403 pending_approval", async () => {
		const { call } = await setup();
		expect((await call("GET", "/api/novels")).status).toBe(401);
		const s = await call("POST", "/api/auth/signup", {
			body: { email: "p@example.com", password: "correct-horse-1" },
		});
		const r = await call("GET", "/api/novels", { cookie: s.cookie });
		expect(r.status).toBe(403);
		expect(r.json.code).toBe("pending_approval");
	});
});

describe("소설 CRUD", () => {
	test("설명 포함 생성·조회·목록·수정(설명 지우기)·삭제", async () => {
		const { call, me } = await world();
		const created = await call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title: "  달빛  ", description: "설명입니다" },
		});
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			title: "달빛",
			description: "설명입니다",
		});

		const list = await call("GET", "/api/novels", { cookie: me.cookie });
		expect(
			list.json.novels.map((n: { title: string }) => n.title).sort(),
		).toEqual(["내 소설", "달빛"]);

		const patched = await call("PATCH", `/api/novels/${created.json.id}`, {
			cookie: me.cookie,
			body: { title: "새 제목", description: null },
		});
		expect(patched.status).toBe(200);
		expect(patched.json).toMatchObject({ title: "새 제목", description: null });
		expect(
			(
				await call("GET", `/api/novels/${created.json.id}`, {
					cookie: me.cookie,
				})
			).json.title,
		).toBe("새 제목");

		expect(
			(
				await call("DELETE", `/api/novels/${created.json.id}`, {
					cookie: me.cookie,
				})
			).status,
		).toBe(204);
		expect(
			(
				await call("GET", `/api/novels/${created.json.id}`, {
					cookie: me.cookie,
				})
			).status,
		).toBe(404);
	});

	test("설명이 1,000자를 넘거나 제목이 비면 400 validation_error", async () => {
		const { call, me } = await world();
		const long = await call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title: "t", description: "가".repeat(1001) },
		});
		expect(long.status).toBe(400);
		expect(long.json.code).toBe("validation_error");
		expect(
			(
				await call("POST", "/api/novels", {
					cookie: me.cookie,
					body: { title: " " },
				})
			).status,
		).toBe(400);
	});

	test("빈 설명은 null로 저장된다", async () => {
		const { call, me } = await world();
		const r = await call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title: "t", description: "" },
		});
		expect(r.json.description).toBeNull();
	});
});

describe("소유권: 다른 회원의 소설·챕터·스냅샷 접근은 404", () => {
	test("다른 회원은 소설·챕터·스냅샷의 모든 경로에서 404를 받고 목록에도 보이지 않는다", async () => {
		const { call, other, novel, chapter, chapterPath, me } = await world();
		const snap = (
			await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json;
		const base = `/api/novels/${novel.id}`;
		const attempts: [string, string, unknown?][] = [
			["GET", base],
			["PATCH", base, { title: "x" }],
			["DELETE", base],
			["GET", `${base}/export?format=txt`],
			["GET", `${base}/chapters`],
			["POST", `${base}/chapters`, { title: "x" }],
			["GET", chapterPath],
			["PATCH", chapterPath, { title: "x" }],
			["DELETE", chapterPath],
			["POST", `${chapterPath}/move`, { direction: "down" }],
			[
				"PUT",
				`${chapterPath}/body`,
				{ body: docOf("x"), expectedUpdatedAt: chapter.updatedAt },
			],
			["GET", `${chapterPath}/snapshots`],
			["POST", `${chapterPath}/snapshots`],
			["GET", `${chapterPath}/snapshots/${snap.id}`],
			["POST", `${chapterPath}/snapshots/${snap.id}/restore`],
		];
		for (const [method, path, body] of attempts) {
			const r = await call(method, path, { cookie: other.cookie, body });
			expect(r.status, `${method} ${path}`).toBe(404);
			expect(r.json.code).toBe("not_found");
		}
		expect(
			(await call("GET", "/api/novels", { cookie: other.cookie })).json.novels,
		).toEqual([]);
		// 본인 데이터는 그대로다.
		expect(
			(await call("GET", chapterPath, { cookie: me.cookie })).json.title,
		).toBe("1화");
	});

	test("내 소설 경로에 다른 소설의 챕터 id를 섞어도 404", async () => {
		const { call, me, chapter } = await world();
		const second = (
			await call("POST", "/api/novels", {
				cookie: me.cookie,
				body: { title: "둘째" },
			})
		).json;
		const r = await call(
			"GET",
			`/api/novels/${second.id}/chapters/${chapter.id}`,
			{ cookie: me.cookie },
		);
		expect(r.status).toBe(404);
	});
});

describe("챕터 CRUD", () => {
	test("새 챕터는 맨 끝에 추가되고 빈 문단 본문으로 시작한다", async () => {
		const { call, me, novel, chapter, addChapter } = await world();
		const second = await addChapter("2화");
		expect(second.position).toBeGreaterThan(chapter.position);
		expect(second.body).toEqual({
			type: "doc",
			content: [{ type: "paragraph" }],
		});
		const list = await call("GET", `/api/novels/${novel.id}/chapters`, {
			cookie: me.cookie,
		});
		expect(list.json.chapters.map((c: { title: string }) => c.title)).toEqual([
			"1화",
			"2화",
		]);
		expect(list.json.chapters[0]).not.toHaveProperty("body");
	});

	test("제목 수정은 updatedAt(저장 버전)을 바꾸지 않고, 삭제 후 조회는 404", async () => {
		const { call, me, chapter, chapterPath, clock } = await world();
		clock.advance(1000);
		const r = await call("PATCH", chapterPath, {
			cookie: me.cookie,
			body: { title: "바뀐 제목" },
		});
		expect(r.status).toBe(200);
		expect(r.json).toMatchObject({
			title: "바뀐 제목",
			updatedAt: chapter.updatedAt,
		});
		expect(
			(await call("DELETE", chapterPath, { cookie: me.cookie })).status,
		).toBe(204);
		expect((await call("GET", chapterPath, { cookie: me.cookie })).status).toBe(
			404,
		);
	});
});

describe("챕터 위/아래 이동", () => {
	test("인접 챕터와 순서를 맞바꾼다", async () => {
		const { call, me, novel, chapter, addChapter } = await world();
		const b = await addChapter("2화");
		const c = await addChapter("3화");
		const titles = async () =>
			(
				await call("GET", `/api/novels/${novel.id}/chapters`, {
					cookie: me.cookie,
				})
			).json.chapters.map((x: { title: string }) => x.title);
		const down = await call(
			"POST",
			`/api/novels/${novel.id}/chapters/${chapter.id}/move`,
			{
				cookie: me.cookie,
				body: { direction: "down" },
			},
		);
		expect(down.status).toBe(200);
		expect(down.json.chapters.map((x: { title: string }) => x.title)).toEqual([
			"2화",
			"1화",
			"3화",
		]);
		expect(await titles()).toEqual(["2화", "1화", "3화"]);
		await call("POST", `/api/novels/${novel.id}/chapters/${c.id}/move`, {
			cookie: me.cookie,
			body: { direction: "up" },
		});
		expect(await titles()).toEqual(["2화", "3화", "1화"]);
		expect(b.id).toBeDefined();
	});

	test("맨 위에서 up, 맨 아래에서 down은 200 no-op이고 순서가 그대로다", async () => {
		const { call, me, novel, chapter, addChapter } = await world();
		const last = await addChapter("2화");
		const up = await call(
			"POST",
			`/api/novels/${novel.id}/chapters/${chapter.id}/move`,
			{
				cookie: me.cookie,
				body: { direction: "up" },
			},
		);
		const down = await call(
			"POST",
			`/api/novels/${novel.id}/chapters/${last.id}/move`,
			{
				cookie: me.cookie,
				body: { direction: "down" },
			},
		);
		for (const r of [up, down]) {
			expect(r.status).toBe(200);
			expect(r.json.chapters.map((x: { title: string }) => x.title)).toEqual([
				"1화",
				"2화",
			]);
		}
	});

	test("챕터를 삭제해 position에 빈 번호가 생겨도 이동이 인접 챕터와 바뀐다", async () => {
		const { call, me, novel, chapter, addChapter } = await world();
		const b = await addChapter("2화");
		await addChapter("3화");
		await call("DELETE", `/api/novels/${novel.id}/chapters/${b.id}`, {
			cookie: me.cookie,
		});
		const r = await call(
			"POST",
			`/api/novels/${novel.id}/chapters/${chapter.id}/move`,
			{
				cookie: me.cookie,
				body: { direction: "down" },
			},
		);
		expect(r.json.chapters.map((x: { title: string }) => x.title)).toEqual([
			"3화",
			"1화",
		]);
	});
});

describe("본문 저장", () => {
	test("저장하면 본문이 유지되고 updatedAt이 새 값으로 바뀐다", async () => {
		const { call, me, chapter, chapterPath, save, clock } = await world();
		clock.advance(5000);
		const r = await save(docOf("본문"), chapter.updatedAt);
		expect(r.status).toBe(200);
		expect(r.json.updatedAt).toBeGreaterThan(chapter.updatedAt);
		const got = await call("GET", chapterPath, { cookie: me.cookie });
		expect(got.json.body).toEqual(docOf("본문"));
		expect(got.json.updatedAt).toBe(r.json.updatedAt);
	});

	test("같은 시각에 연속 저장해도 updatedAt은 매번 달라진다", async () => {
		const { chapter, save } = await world();
		const a = await save(docOf("a"), chapter.updatedAt);
		const b = await save(docOf("b"), a.json.updatedAt);
		expect(b.status).toBe(200);
		expect(b.json.updatedAt).not.toBe(a.json.updatedAt);
	});

	test("허용되지 않은 노드가 든 본문은 400 validation_error이고 저장되지 않는다", async () => {
		const { call, me, chapter, chapterPath, save } = await world();
		const bad = {
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 1 },
					content: [{ type: "text", text: "x" }],
				},
			],
		};
		const r = await save(bad, chapter.updatedAt);
		expect(r.status).toBe(400);
		expect(r.json.code).toBe("validation_error");
		const badMark = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "x", marks: [{ type: "italic" }] }],
				},
			],
		};
		expect((await save(badMark, chapter.updatedAt)).status).toBe(400);
		expect(
			(await call("GET", chapterPath, { cookie: me.cookie })).json.body,
		).toEqual(chapter.body);
	});

	test("본문 JSON이 1MB를 넘으면 413 payload_too_large이고 저장되지 않는다", async () => {
		const { call, me, chapter, chapterPath, save } = await world();
		const huge = docOf("가".repeat(CHAPTER_BODY_MAX_BYTES)); // 한글 3바이트 → 3MB
		const r = await save(huge, chapter.updatedAt);
		expect(r.status).toBe(413);
		expect(r.json.code).toBe("payload_too_large");
		// 1MB 이하(경계 근처)는 저장된다.
		const fits = docOf("a".repeat(CHAPTER_BODY_MAX_BYTES - 200));
		expect((await save(fits, chapter.updatedAt)).status).toBe(200);
		expect(
			(await call("GET", chapterPath, { cookie: me.cookie })).json.body,
		).toEqual(fits);
	});

	test("불러온 버전(expectedUpdatedAt)이 서버와 다르면 409 version_conflict이고 현재 버전을 알려 준다", async () => {
		const { call, me, chapter, chapterPath, save, clock } = await world();
		clock.advance(1000);
		const first = await save(docOf("탭 A"), chapter.updatedAt);
		expect(first.status).toBe(200);
		// 탭 B는 옛 버전으로 저장한다.
		const stale = await save(docOf("탭 B"), chapter.updatedAt);
		expect(stale.status).toBe(409);
		expect(stale.json.code).toBe("version_conflict");
		expect(stale.json.currentUpdatedAt).toBe(first.json.updatedAt);
		expect(
			(await call("GET", chapterPath, { cookie: me.cookie })).json.body,
		).toEqual(docOf("탭 A"));
		// 최신 버전을 받아 다시 보내면(덮어쓰기) 성공한다.
		expect(
			(await save(docOf("탭 B"), stale.json.currentUpdatedAt)).status,
		).toBe(200);
	});

	test("expectedUpdatedAt이 없으면 400", async () => {
		const { call, me, chapterPath } = await world();
		const r = await call("PUT", `${chapterPath}/body`, {
			cookie: me.cookie,
			body: { body: docOf("x") },
		});
		expect(r.status).toBe(400);
	});
});

describe("스냅샷", () => {
	test("수동 스냅샷은 현재 본문을 보관하고 목록(최신순, 본문 없음)·단건(본문 포함)으로 조회된다", async () => {
		const { call, me, chapter, chapterPath, save, clock } = await world();
		const saved = await save(docOf("v1"), chapter.updatedAt);
		const snap = await call("POST", `${chapterPath}/snapshots`, {
			cookie: me.cookie,
		});
		expect(snap.status).toBe(201);
		expect(snap.json).toMatchObject({ kind: "manual", chapterId: chapter.id });
		clock.advance(1000);
		await save(docOf("v2"), saved.json.updatedAt);
		const snap2 = await call("POST", `${chapterPath}/snapshots`, {
			cookie: me.cookie,
		});
		const list = await call("GET", `${chapterPath}/snapshots`, {
			cookie: me.cookie,
		});
		expect(list.json.snapshots.map((s: { id: string }) => s.id)).toEqual([
			snap2.json.id,
			snap.json.id,
		]);
		expect(list.json.snapshots[0]).not.toHaveProperty("body");
		const one = await call("GET", `${chapterPath}/snapshots/${snap.json.id}`, {
			cookie: me.cookie,
		});
		expect(one.json.body).toEqual(docOf("v1"));
	});

	test("복원하면 복원 직전 본문이 auto 스냅샷으로 남고 본문이 스냅샷으로 교체된다", async () => {
		const { call, me, chapter, chapterPath, save, clock } = await world();
		const v1 = await save(docOf("v1"), chapter.updatedAt);
		const manual = (
			await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json;
		clock.advance(1000);
		await save(docOf("v2"), v1.json.updatedAt);
		clock.advance(1000);
		const restored = await call(
			"POST",
			`${chapterPath}/snapshots/${manual.id}/restore`,
			{ cookie: me.cookie },
		);
		expect(restored.status).toBe(200);
		expect(restored.json.body).toEqual(docOf("v1"));
		const got = await call("GET", chapterPath, { cookie: me.cookie });
		expect(got.json.body).toEqual(docOf("v1"));
		expect(got.json.updatedAt).toBe(restored.json.updatedAt);

		const list = (
			await call("GET", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json.snapshots;
		const auto = list.filter((s: { kind: string }) => s.kind === "auto");
		expect(auto).toHaveLength(1);
		const autoBody = (
			await call("GET", `${chapterPath}/snapshots/${auto[0].id}`, {
				cookie: me.cookie,
			})
		).json.body;
		expect(autoBody).toEqual(docOf("v2")); // 복원 전 본문
		expect(list.some((s: { id: string }) => s.id === manual.id)).toBe(true);
	});

	test("auto 21번째 생성 시 가장 오래된 auto가 삭제되고 manual은 보존된다", async () => {
		const { call, me, db, chapter, chapterPath, clock } = await world();
		const manual = (
			await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json;
		const restoreOnce = async (marker: string) => {
			// 복원할 때마다 직전 본문이 auto로 남으므로, 본문 표식을 바꿔 가며 반복한다.
			clock.advance(1000);
			const cur = (await call("GET", chapterPath, { cookie: me.cookie })).json;
			await call("PUT", `${chapterPath}/body`, {
				cookie: me.cookie,
				body: { body: docOf(marker), expectedUpdatedAt: cur.updatedAt },
			});
			clock.advance(1000);
			await call("POST", `${chapterPath}/snapshots/${manual.id}/restore`, {
				cookie: me.cookie,
			});
		};
		for (let i = 1; i <= AUTO_SNAPSHOT_LIMIT; i++) await restoreOnce(`m${i}`);
		const autos = () =>
			db
				.select()
				.from(chapterSnapshots)
				.all()
				.filter((s) => s.kind === "auto");
		expect(autos()).toHaveLength(AUTO_SNAPSHOT_LIMIT);
		const oldest = autos().sort(
			(a, b) => a.createdAt - b.createdAt,
		)[0] as ReturnType<typeof autos>[number];
		expect(JSON.parse(oldest.body)).toEqual(docOf("m1"));

		await restoreOnce("m21");
		expect(autos()).toHaveLength(AUTO_SNAPSHOT_LIMIT);
		expect(autos().some((s) => s.id === oldest.id)).toBe(false);
		expect(
			autos().some(
				(s) =>
					JSON.stringify(JSON.parse(s.body)) === JSON.stringify(docOf("m21")),
			),
		).toBe(true);
		const manuals = db
			.select()
			.from(chapterSnapshots)
			.all()
			.filter((s) => s.kind === "manual");
		expect(manuals.map((s) => s.id)).toEqual([manual.id]);
		expect(chapter.id).toBeDefined();
	});

	test("다른 챕터의 스냅샷 id로는 복원할 수 없다(404)", async () => {
		const { call, me, novel, chapterPath, addChapter } = await world();
		const second = await addChapter("2화");
		const snap = (
			await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie })
		).json;
		const r = await call(
			"POST",
			`/api/novels/${novel.id}/chapters/${second.id}/snapshots/${snap.id}/restore`,
			{
				cookie: me.cookie,
			},
		);
		expect(r.status).toBe(404);
	});
});

describe("CASCADE", () => {
	test("소설을 삭제하면 챕터와 스냅샷도 함께 삭제된다", async () => {
		const { call, db, me, novel, chapterPath } = await world();
		await call("POST", `${chapterPath}/snapshots`, { cookie: me.cookie });
		expect(db.select().from(chapterSnapshots).all()).toHaveLength(1);
		expect(
			(await call("DELETE", `/api/novels/${novel.id}`, { cookie: me.cookie }))
				.status,
		).toBe(204);
		const { chapters } = await import("@novelist/db");
		expect(db.select().from(chapters).all()).toHaveLength(0);
		expect(db.select().from(chapterSnapshots).all()).toHaveLength(0);
	});
});
