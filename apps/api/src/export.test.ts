import type { Doc } from "@novelist/shared";
import { describe, expect, test } from "vitest";
import { setup } from "./test-utils";

const text = (t: string, bold = false) => ({
	type: "text",
	text: t,
	...(bold ? { marks: [{ type: "bold" }] } : {}),
});
const para = (...c: unknown[]) => ({ type: "paragraph", content: c });
const doc = (...c: unknown[]) => ({ type: "doc", content: c }) as Doc;

async function exportWorld(title = "달빛 아래", description?: string) {
	const s = await setup();
	const me = await s.activeMember("me@example.com", await s.adminCookie());
	const novel = (
		await s.call("POST", "/api/novels", {
			cookie: me.cookie,
			body: { title, description },
		})
	).json;
	const addChapter = async (chTitle: string, body?: Doc) => {
		const ch = (
			await s.call("POST", `/api/novels/${novel.id}/chapters`, {
				cookie: me.cookie,
				body: { title: chTitle },
			})
		).json;
		if (body) {
			await s.call("PUT", `/api/novels/${novel.id}/chapters/${ch.id}/body`, {
				cookie: me.cookie,
				body: { body, expectedUpdatedAt: ch.updatedAt },
			});
		}
		return ch;
	};
	const get = (format: string) =>
		s.app.request(`/api/novels/${novel.id}/export?format=${format}`, {
			headers: { Cookie: me.cookie },
		});
	return { ...s, me, novel, addChapter, get };
}

describe("내보내기", () => {
	test("TXT: 제목·설명·챕터 제목·본문, 장면 전환 * * *, 강조 표시 없음, 빈 챕터는 제목만", async () => {
		const { addChapter, get } = await exportWorld(
			"달빛 아래",
			"첫 줄\n둘째 줄",
		);
		await addChapter(
			"1화",
			doc(
				para(text("그는 "), text("강하게", true), text(" 말했다.")),
				{ type: "horizontalRule" },
				para(text("다음 장면")),
			),
		);
		await addChapter("2화");
		await addChapter("3화", doc(para(text("끝"))));
		const res = await get("txt");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(
			`${[
				"달빛 아래",
				"첫 줄\n둘째 줄",
				"1화",
				"그는 강하게 말했다.\n\n* * *\n\n다음 장면",
				"2화",
				"3화",
				"끝",
			].join("\n\n")}\n`,
		);
	});

	test("Markdown: # 소설 제목, ## 챕터 제목, **강조**, 장면 전환 * * *", async () => {
		const { addChapter, get } = await exportWorld("달빛 아래", "소개");
		await addChapter(
			"1화",
			doc(
				para(text("그는 "), text("강하게", true), text(" 말했다.")),
				{ type: "horizontalRule" },
				para(text("다음")),
			),
		);
		await addChapter("2화");
		const res = await get("md");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(
			`${[
				"# 달빛 아래",
				"소개",
				"## 1화",
				"그는 **강하게** 말했다.\n\n* * *\n\n다음",
				"## 2화",
			].join("\n\n")}\n`,
		);
	});

	test("설명이 없으면 설명 블록을 생략한다", async () => {
		const { addChapter, get } = await exportWorld("제목");
		await addChapter("1화", doc(para(text("본문"))));
		expect(await (await get("txt")).text()).toBe("제목\n\n1화\n\n본문\n");
		expect(await (await get("md")).text()).toBe("# 제목\n\n## 1화\n\n본문\n");
	});

	test("챕터가 없는 소설은 제목(과 설명)만 내보낸다", async () => {
		const { get } = await exportWorld("제목");
		expect(await (await get("txt")).text()).toBe("제목\n");
	});

	test("챕터는 현재 순서대로 나온다", async () => {
		const { addChapter, get, call, me, novel } = await exportWorld("제목");
		await addChapter("1화");
		const b = await addChapter("2화");
		await call("POST", `/api/novels/${novel.id}/chapters/${b.id}/move`, {
			cookie: me.cookie,
			body: { direction: "up" },
		});
		expect(await (await get("txt")).text()).toBe("제목\n\n2화\n\n1화\n");
	});

	test("헤더: UTF-8 Content-Type과 소설 제목 기반 Content-Disposition(금지 문자 제거)", async () => {
		const { get } = await exportWorld('달빛: 아래/위? "1부"*');
		const txt = await get("txt");
		expect(txt.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
		const cd = txt.headers.get("Content-Disposition") as string;
		expect(cd).toContain("attachment;");
		expect(cd).toContain(
			`filename*=UTF-8''${encodeURIComponent("달빛 아래위 1부.txt")}`,
		);
		expect(cd).not.toMatch(/[:/?"*]\./);
		const md = await get("md");
		expect(md.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
		expect(md.headers.get("Content-Disposition")).toContain(
			encodeURIComponent("달빛 아래위 1부.md"),
		);
	});

	test("제목이 금지 문자뿐이면 파일명은 novel로 대체된다", async () => {
		const { get } = await exportWorld("???");
		const cd = (await get("txt")).headers.get("Content-Disposition") as string;
		expect(cd).toContain('filename="novel.txt"');
	});

	test("format이 txt·md가 아니면 400", async () => {
		const { get } = await exportWorld("제목");
		expect((await get("pdf")).status).toBe(400);
	});

	test("마크다운 내보내기는 제목·본문의 특수문자를 이스케이프한다", async () => {
		const { addChapter, get } = await exportWorld("*제목*");
		await addChapter("# 1화", doc(para(text("a_b"))));
		expect(await (await get("md")).text()).toBe(
			"# \\*제목\\*\n\n## \\# 1화\n\na\\_b\n",
		);
	});
});
