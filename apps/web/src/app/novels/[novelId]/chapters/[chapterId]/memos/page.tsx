"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MemoWorkspace } from "../../../../../../components/memo-workspace";
import { getChapter, getNovel } from "../../../../../../lib/novels";
import { useList } from "../../../../../../lib/use-list";

/** A chapter's memos as a full screen: where the reader's "이 챕터 메모" leads. */
export default function ChapterMemosPage() {
	const { novelId, chapterId } = useParams<{
		novelId: string;
		chapterId: string;
	}>();
	const [initial, setInitial] = useState<{
		memoId?: string;
		creating?: boolean;
	} | null>(null);
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		setInitial({
			memoId: params.get("memo") ?? undefined,
			creating: params.get("new") === "1",
		});
	}, []);
	const { state, reload } = useList(async () => {
		const [novel, chapter] = await Promise.all([
			getNovel(novelId),
			getChapter(novelId, chapterId),
		]);
		return { novel, chapter };
	});

	if (state.status === "loading") {
		return (
			<p className="muted" aria-busy="true">
				불러오는 중…
			</p>
		);
	}
	if (state.status === "error") {
		return (
			<>
				<p
					role="alert"
					className="form-alert"
					data-testid="chapter-memos-error"
				>
					{state.message}
				</p>
				<button type="button" className="btn" onClick={reload}>
					다시 시도
				</button>
			</>
		);
	}
	const { novel, chapter } = state.data;
	return (
		<>
			<p>
				<Link
					href={`/novels/${novelId}/chapters/${chapterId}/read`}
					data-testid="memos-back-to-reader"
				>
					← 읽기로 돌아가기
				</Link>
			</p>
			<h1 className="page-title" data-testid="chapter-memos-title">
				{chapter.title} · 메모
			</h1>
			<p className="muted">{novel.title}</p>
			{initial && (
				<MemoWorkspace
					variant="page"
					context={{ novelId, chapterId }}
					initial={initial}
				/>
			)}
		</>
	);
}
