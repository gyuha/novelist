"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DocView } from "../../../../../../components/doc-view";
import { useMe } from "../../../../../../lib/auth";
import { clearDraft, readDraft } from "../../../../../../lib/draft";
import { withLiveMarks } from "../../../../../../lib/memos";
import {
	getChapter,
	getNovel,
	listChapters,
} from "../../../../../../lib/novels";
import { useIsDesktop } from "../../../../../../lib/use-desktop";
import { useList } from "../../../../../../lib/use-list";
import { EditorWorkspace } from "./workspace";

export default function EditChapterPage() {
	const { novelId, chapterId } = useParams<{
		novelId: string;
		chapterId: string;
	}>();
	return (
		<EditorLoader key={chapterId} novelId={novelId} chapterId={chapterId} />
	);
}

function EditorLoader({
	novelId,
	chapterId,
}: {
	novelId: string;
	chapterId: string;
}) {
	const me = useMe();
	const isDesktop = useIsDesktop();
	const { state, reload } = useList(async () => {
		const [novel, loaded, chapters] = await Promise.all([
			getNovel(novelId),
			getChapter(novelId, chapterId),
			listChapters(novelId),
		]);
		const chapter = await withLiveMarks(novelId, loaded);
		let draft = readDraft(me.id, chapterId);
		// Only a draft newer than the server body and different from it is offered.
		if (
			draft &&
			(draft.savedAt <= loaded.updatedAt ||
				JSON.stringify(draft.body) === JSON.stringify(loaded.body))
		) {
			clearDraft(me.id, chapterId);
			draft = null;
		}
		return { novel, chapter, chapters, draft };
	});

	if (state.status === "loading") {
		return (
			<div className="bare-message">
				<p className="muted" aria-busy="true" data-testid="editor-loading">
					불러오는 중…
				</p>
			</div>
		);
	}
	if (state.status === "error") {
		return (
			<div className="bare-message">
				<p role="alert" className="form-alert" data-testid="editor-load-error">
					{state.message}
				</p>
				<button
					type="button"
					className="btn"
					onClick={reload}
					data-testid="editor-retry"
				>
					다시 시도
				</button>
				<p>
					<Link href={`/novels/${novelId}`}>챕터 목록으로 돌아가기</Link>
				</p>
			</div>
		);
	}

	const { novel, chapter, chapters, draft } = state.data;

	if (!isDesktop) {
		return (
			<div className="bare-message" data-testid="editor-mobile">
				<p>
					<Link href={`/novels/${novelId}`}>← {novel.title}</Link>
				</p>
				<h1 className="auth-title">{chapter.title}</h1>
				<p className="muted">
					본문 편집과 AI는 데스크톱에서 사용할 수 있습니다
				</p>
				<p>
					<Link
						href={`/novels/${novelId}/chapters/${chapterId}/read`}
						className="btn btn-link"
					>
						리더로 읽기
					</Link>{" "}
					<Link
						href={`/novels/${novelId}/chapters/${chapterId}/memos`}
						className="btn btn-link"
						data-testid="editor-mobile-memos"
					>
						이 챕터 메모
					</Link>
				</p>
				<div className="prose">
					<DocView doc={chapter.body} />
				</div>
			</div>
		);
	}

	return (
		<EditorWorkspace
			userId={me.id}
			novelId={novelId}
			novelTitle={novel.title}
			chapter={chapter}
			chapters={chapters}
			draft={draft}
		/>
	);
}
