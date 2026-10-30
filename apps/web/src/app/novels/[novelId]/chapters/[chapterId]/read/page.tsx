"use client";

import { toPlainText } from "@novelist/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { DocView } from "../../../../../../components/doc-view";
import {
	getChapter,
	getNovel,
	listChapters,
} from "../../../../../../lib/novels";
import { useIsDesktop } from "../../../../../../lib/use-desktop";
import { useList } from "../../../../../../lib/use-list";
import { ReaderSettingsMenu, useReaderSettings } from "./reader-settings";

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
						<DocView doc={chapter.body} />
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
