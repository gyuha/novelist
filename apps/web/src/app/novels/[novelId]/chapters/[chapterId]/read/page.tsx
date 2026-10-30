"use client";

import { toPlainText } from "@novelist/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocView } from "../../../../../../components/doc-view";
import { memoListTitle } from "../../../../../../lib/memo-text";
import { listAnnotations, listMemos } from "../../../../../../lib/memos";
import {
	getChapter,
	getNovel,
	listChapters,
} from "../../../../../../lib/novels";
import { useIsDesktop } from "../../../../../../lib/use-desktop";
import { useList } from "../../../../../../lib/use-list";
import { ReaderSettingsMenu, useReaderSettings } from "./reader-settings";

/** Set when the reader is left for the memo screen, read back when the member returns. */
const scrollKey = (chapterId: string) => `novelist:reader-scroll:${chapterId}`;

export default function ReadChapterPage() {
	const { novelId, chapterId } = useParams<{
		novelId: string;
		chapterId: string;
	}>();
	return <Reader key={chapterId} novelId={novelId} chapterId={chapterId} />;
}

function Reader({
	novelId,
	chapterId,
}: {
	novelId: string;
	chapterId: string;
}) {
	const isDesktop = useIsDesktop();
	const reader = useReaderSettings();
	const tocRef = useRef<HTMLDialogElement>(null);
	const { state, reload } = useList(async () => {
		const [novel, chapter, chapters] = await Promise.all([
			getNovel(novelId),
			getChapter(novelId, chapterId),
			listChapters(novelId),
		]);
		return { novel, chapter, chapters };
	});
	// Memos load on their own: a memo failure must not block reading.
	const memos = useList(() => listMemos({ scope: "chapter", chapterId }));
	const [showAnnotations, setShowAnnotations] = useState(false);
	const [anchored, setAnchored] = useState<Set<string>>(new Set());
	const restoredRef = useRef(false);
	const ready = state.status === "ready";

	// Annotation marks are hidden by default; showing them needs the rows to skip dead marks.
	useEffect(() => {
		if (!showAnnotations) return;
		listAnnotations(novelId, chapterId)
			.then((rows) =>
				setAnchored(
					new Set(
						rows.filter((r) => r.state === "anchored").map((r) => r.markId),
					),
				),
			)
			.catch(() => setShowAnnotations(false));
	}, [showAnnotations, novelId, chapterId]);
	const shownIds = useMemo(
		() => (showAnnotations ? anchored : undefined),
		[showAnnotations, anchored],
	);

	// Back from the memo screen: return to where the member was reading.
	useEffect(() => {
		if (!ready || restoredRef.current) return;
		restoredRef.current = true;
		try {
			const y = sessionStorage.getItem(scrollKey(chapterId));
			if (y !== null) {
				sessionStorage.removeItem(scrollKey(chapterId));
				window.scrollTo(0, Number(y));
			}
		} catch {
			// storage unavailable: start at the top
		}
	}, [ready, chapterId]);

	function rememberPosition() {
		try {
			sessionStorage.setItem(scrollKey(chapterId), String(window.scrollY));
		} catch {
			// storage unavailable: the reader simply opens at the top next time
		}
	}

	const header = (title: string) => (
		<header className="reader-header">
			<Link
				href={`/novels/${novelId}`}
				className="btn btn-link"
				data-testid="reader-back"
			>
				← 소설로
			</Link>
			<span className="reader-novel-title">{title}</span>
			<div className="header-actions">
				<button
					type="button"
					className="btn"
					onClick={() => tocRef.current?.showModal()}
					data-testid="reader-toc-button"
				>
					목차
				</button>
				<button
					type="button"
					className="btn"
					aria-pressed={showAnnotations}
					onClick={() => setShowAnnotations((v) => !v)}
					data-testid="reader-annotations-toggle"
				>
					주석 표시
				</button>
				<ReaderSettingsMenu {...reader} />
			</div>
		</header>
	);

	if (state.status === "loading") {
		return (
			<div className="reader">
				{header("")}
				<p
					className="muted reader-state"
					aria-busy="true"
					data-testid="reader-loading"
				>
					불러오는 중…
				</p>
			</div>
		);
	}
	if (state.status === "error") {
		return (
			<div className="reader">
				{header("")}
				<div className="reader-state">
					<p role="alert" className="form-alert" data-testid="reader-error">
						{state.message}
					</p>
					<button
						type="button"
						className="btn"
						onClick={reload}
						data-testid="reader-retry"
					>
						다시 시도
					</button>
				</div>
			</div>
		);
	}

	const { novel, chapter, chapters } = state.data;
	const index = chapters.findIndex((c) => c.id === chapterId);
	const prev = index > 0 ? chapters[index - 1] : null;
	const next = index >= 0 ? (chapters[index + 1] ?? null) : null;
	const empty =
		!chapter.body.content?.some((n) => n.type === "horizontalRule") &&
		toPlainText(chapter.body) === "";
	const memosHref = `/novels/${novelId}/chapters/${chapterId}/memos`;
	const readHref = (id: string) => `/novels/${novelId}/chapters/${id}/read`;

	return (
		<div className="reader">
			{header(novel.title)}

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc closes the modal dialog natively */}
			<dialog
				ref={tocRef}
				className="drawer toc-drawer"
				aria-label="목차"
				data-testid="reader-toc"
				onClick={(event) => {
					if (event.target === tocRef.current) tocRef.current?.close();
				}}
			>
				<div className="drawer-head">
					<strong>목차</strong>
					<button
						type="button"
						className="btn"
						onClick={() => tocRef.current?.close()}
					>
						닫기
					</button>
				</div>
				<ol className="nav-list">
					{chapters.map((c, i) => (
						<li key={c.id}>
							<Link
								href={readHref(c.id)}
								className="nav-link"
								aria-current={c.id === chapterId ? "page" : undefined}
								onClick={() => tocRef.current?.close()}
								data-testid={`toc-item-${i + 1}`}
							>
								{c.title}
							</Link>
						</li>
					))}
				</ol>
			</dialog>

			<main
				className="reader-main"
				data-font={reader.settings.font}
				data-size={reader.settings.size}
				data-width={reader.settings.width}
				data-testid="reader-main"
			>
				<h1 className="reader-chapter-title" data-testid="reader-chapter-title">
					{chapter.title}
				</h1>
				{empty ? (
					<div data-testid="reader-empty">
						<p className="muted">아직 작성된 본문이 없습니다</p>
						<Link href={`/novels/${novelId}`}>챕터 목록</Link>
					</div>
				) : (
					<article className="prose reader-prose" data-testid="reader-body">
						<DocView doc={chapter.body} annotationIds={shownIds} />
					</article>
				)}
				<nav className="reader-pager" aria-label="챕터 이동">
					{prev ? (
						<Link
							href={readHref(prev.id)}
							className="btn btn-link"
							data-testid="reader-prev"
						>
							← 이전 챕터
						</Link>
					) : (
						<span />
					)}
					{next ? (
						<Link
							href={readHref(next.id)}
							className="btn btn-link"
							data-testid="reader-next"
						>
							다음 챕터 →
						</Link>
					) : (
						<span />
					)}
				</nav>
				<section
					className="reader-memos"
					aria-labelledby="reader-memos-title"
					data-testid="reader-memos"
				>
					<h2 className="panel-title" id="reader-memos-title">
						이 챕터 메모
					</h2>
					{memos.state.status === "loading" && (
						<p className="muted" aria-busy="true">
							불러오는 중…
						</p>
					)}
					{memos.state.status === "error" && (
						<div>
							<p
								role="alert"
								className="form-alert"
								data-testid="reader-memos-error"
							>
								{memos.state.message}
							</p>
							<button type="button" className="btn" onClick={memos.reload}>
								다시 시도
							</button>
						</div>
					)}
					{memos.state.status === "ready" &&
						(memos.state.data.length === 0 ? (
							<p className="muted" data-testid="reader-memos-empty">
								이 챕터에 남긴 메모가 없습니다
							</p>
						) : (
							<ul className="rows" data-testid="reader-memo-list">
								{memos.state.data.map((memo) => (
									<li key={memo.id} className="row">
										<Link
											href={`${memosHref}?memo=${memo.id}`}
											onClick={rememberPosition}
											data-testid="reader-memo-item"
										>
											{memoListTitle(memo)}
										</Link>
									</li>
								))}
							</ul>
						))}
					<p>
						<Link
							href={`${memosHref}?new=1`}
							className="btn btn-link"
							onClick={rememberPosition}
							data-testid="reader-memo-new"
						>
							메모 쓰기
						</Link>{" "}
						<Link
							href={memosHref}
							className="btn btn-link"
							onClick={rememberPosition}
							data-testid="reader-memo-open"
						>
							메모 전체 화면
						</Link>
					</p>
				</section>
				{isDesktop && (
					<p>
						<Link
							href={`/novels/${novelId}/chapters/${chapterId}/edit`}
							data-testid="reader-to-editor"
						>
							편집으로 돌아가기
						</Link>
					</p>
				)}
			</main>
		</div>
	);
}
