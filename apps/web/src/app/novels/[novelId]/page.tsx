"use client";

import type { ChapterSummary, ExportFormat } from "@novelist/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/dialog";
import { MoreMenu } from "../../../components/more-menu";
import { TitleForm } from "../../../components/title-form";
import { errorText } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import { chapterDeletePreview } from "../../../lib/memos";
import {
	createChapter,
	deleteChapter,
	downloadExport,
	getNovel,
	listChapters,
	moveChapter,
	renameChapter,
} from "../../../lib/novels";
import {
	DeleteMemoNote,
	useDeletePreview,
} from "../../../lib/use-delete-preview";
import { useIsDesktop } from "../../../lib/use-desktop";
import { useList } from "../../../lib/use-list";

export default function ChaptersPage() {
	const { novelId } = useParams<{ novelId: string }>();
	const router = useRouter();
	const isDesktop = useIsDesktop();
	const { state, reload } = useList(async () => {
		const [novel, chapters] = await Promise.all([
			getNovel(novelId),
			listChapters(novelId),
		]);
		return { novel, chapters };
	});
	const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
	const [creating, setCreating] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChapterSummary | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [moving, setMoving] = useState<string | null>(null);
	const [moveError, setMoveError] = useState<{
		id: string;
		direction: "up" | "down";
		message: string;
	} | null>(null);
	const [exporting, setExporting] = useState<ExportFormat | null>(null);
	const [exportError, setExportError] = useState<ExportFormat | null>(null);
	const [exportMenuOpen, setExportMenuOpen] = useState(false);
	const focusRef = useRef<string | null>(null);

	useEffect(() => {
		if (state.status === "ready") setChapters(state.data.chapters);
	}, [state]);

	// Keep keyboard focus on the moved chapter's button (or its twin at an end).
	useEffect(() => {
		if (!chapters || !focusRef.current) return;
		const [id, direction] = focusRef.current.split(":");
		focusRef.current = null;
		const own = document.querySelector<HTMLButtonElement>(
			`[data-testid="move-${direction}-${id}"]`,
		);
		const twin = document.querySelector<HTMLButtonElement>(
			`[data-testid="move-${direction === "up" ? "down" : "up"}-${id}"]`,
		);
		(own && !own.disabled ? own : twin)?.focus();
	}, [chapters]);

	if (state.status === "loading" || (state.status === "ready" && !chapters)) {
		return (
			<p className="muted" aria-busy="true" data-testid="chapters-loading">
				불러오는 중…
			</p>
		);
	}
	if (state.status === "error") {
		return (
			<>
				<p role="alert" className="form-alert" data-testid="chapters-error">
					{state.message}
				</p>
				<button
					type="button"
					className="btn"
					onClick={reload}
					data-testid="chapters-retry"
				>
					다시 시도
				</button>
				<p>
					<Link href="/novels">내 소설로 돌아가기</Link>
				</p>
			</>
		);
	}

	const novel = state.data.novel;
	const list = chapters ?? [];

	async function move(chapter: ChapterSummary, direction: "up" | "down") {
		if (moving) return;
		setMoving(chapter.id);
		setMoveError(null);
		try {
			focusRef.current = `${chapter.id}:${direction}`;
			setChapters(await moveChapter(novelId, chapter.id, direction));
		} catch (error) {
			focusRef.current = null;
			setMoveError({ id: chapter.id, direction, message: errorText(error) });
		} finally {
			setMoving(null);
		}
	}

	async function runExport(format: ExportFormat) {
		setExportMenuOpen(false);
		setExporting(format);
		setExportError(null);
		try {
			await downloadExport(novelId, format);
		} catch {
			setExportError(format);
		} finally {
			setExporting(null);
		}
	}

	return (
		<>
			<p>
				<Link href="/novels" data-testid="back-to-novels">
					← 내 소설
				</Link>
			</p>
			<h1 className="page-title" data-testid="novel-title">
				{novel.title}
			</h1>
			{novel.description && (
				<p
					className="novel-description novel-description-full"
					data-testid="novel-description"
				>
					{novel.description}
				</p>
			)}

			<div className="action-row">
				<button
					type="button"
					className="btn btn-primary desktop-only"
					disabled={creating}
					onClick={() => setCreating(true)}
					data-testid="new-chapter-button"
				>
					새 챕터
				</button>
				<div className="menu-root">
					<button
						type="button"
						className="btn"
						aria-haspopup="menu"
						aria-expanded={exportMenuOpen}
						disabled={exporting !== null}
						aria-busy={exporting !== null}
						onClick={() => setExportMenuOpen((v) => !v)}
						data-testid="export-button"
					>
						{exporting ? "내보내는 중…" : "내보내기"}
					</button>
					{exportMenuOpen && (
						<div className="menu" role="menu" data-testid="export-menu">
							<button
								type="button"
								role="menuitem"
								className="menu-item"
								onClick={() => runExport("txt")}
								data-testid="export-txt"
							>
								소설 전체 TXT
							</button>
							<button
								type="button"
								role="menuitem"
								className="menu-item"
								onClick={() => runExport("md")}
								data-testid="export-md"
							>
								소설 전체 Markdown
							</button>
						</div>
					)}
				</div>
				<Link
					href={`/memos?scope=novel&novelId=${novelId}`}
					className="btn btn-link"
					data-testid="novel-memos-link"
				>
					소설 메모
				</Link>
				{list[0] ? (
					<Link
						href={`/novels/${novelId}/chapters/${list[0].id}/read`}
						className="btn btn-link"
						data-testid="read-novel"
					>
						리더로 읽기
					</Link>
				) : null}
			</div>
			{exportError && (
				<p role="alert" className="form-alert" data-testid="export-error">
					내보내기에 실패했습니다.{" "}
					<button
						type="button"
						className="btn"
						onClick={() => runExport(exportError)}
						data-testid="export-retry"
					>
						다시 시도
					</button>
				</p>
			)}

			{creating && isDesktop && (
				<TitleForm
					label="챕터 제목"
					submitLabel="만들기"
					busyLabel="만드는 중…"
					testId="new-chapter-form"
					onCancel={() => setCreating(false)}
					onSubmit={async (title) => {
						try {
							const chapter = await createChapter(novelId, title);
							router.push(`/novels/${novelId}/chapters/${chapter.id}/edit`);
							return null;
						} catch (error) {
							return errorText(error);
						}
					}}
				/>
			)}

			{list.length === 0 ? (
				<p className="muted" data-testid="chapters-empty">
					첫 챕터를 만들어 보세요
				</p>
			) : (
				<ol className="rows chapter-rows" data-testid="chapter-list">
					{list.map((chapter, index) => {
						const href = `/novels/${novelId}/chapters/${chapter.id}/${isDesktop ? "edit" : "read"}`;
						return (
							<li
								key={chapter.id}
								className="row"
								aria-busy={moving === chapter.id}
								data-testid={`chapter-row-${index + 1}`}
							>
								{renamingId === chapter.id ? (
									<TitleForm
										label="챕터 제목"
										initialTitle={chapter.title}
										submitLabel="저장"
										busyLabel="저장 중…"
										testId="rename-chapter-form"
										onCancel={() => setRenamingId(null)}
										onSubmit={async (title) => {
											try {
												await renameChapter(novelId, chapter.id, title);
											} catch (error) {
												return errorText(error);
											}
											setRenamingId(null);
											setChapters(await listChapters(novelId));
											return null;
										}}
									/>
								) : (
									<>
										<span className="row-meta chapter-number">{index + 1}</span>
										<div className="row-main">
											<Link
												href={href}
												className="novel-link"
												data-testid={`chapter-link-${index + 1}`}
											>
												{chapter.title}
											</Link>
											<p className="row-meta">
												최근 저장 {formatDateTime(chapter.updatedAt)}
											</p>
											{moveError?.id === chapter.id && (
												<p
													role="alert"
													className="field-error"
													data-testid="move-error"
												>
													{moveError.message}{" "}
													<button
														type="button"
														className="btn"
														onClick={() => move(chapter, moveError.direction)}
														data-testid="move-retry"
													>
														다시 시도
													</button>
												</p>
											)}
										</div>
										<span className="row-actions desktop-only">
											<button
												type="button"
												className="btn"
												disabled={index === 0 || moving !== null}
												onClick={() => move(chapter, "up")}
												data-testid={`move-up-${chapter.id}`}
											>
												위로
											</button>
											<button
												type="button"
												className="btn"
												disabled={index === list.length - 1 || moving !== null}
												onClick={() => move(chapter, "down")}
												data-testid={`move-down-${chapter.id}`}
											>
												아래로
											</button>
											<MoreMenu
												label={`${chapter.title} 더보기`}
												testId={`chapter-more-${index + 1}`}
												items={[
													{
														label: "이름 변경",
														testId: `chapter-rename-${index + 1}`,
														onSelect: () => setRenamingId(chapter.id),
													},
													{
														label: "삭제",
														danger: true,
														testId: `chapter-delete-${index + 1}`,
														onSelect: () => {
															setDeleteError(null);
															setDeleting(chapter);
														},
													},
												]}
											/>
										</span>
									</>
								)}
							</li>
						);
					})}
				</ol>
			)}

			{deleting && (
				<DeleteChapterDialog
					novelId={novelId}
					chapter={deleting}
					busy={deleteBusy}
					error={deleteError}
					onCancel={() => setDeleting(null)}
					onConfirm={async () => {
						setDeleteBusy(true);
						setDeleteError(null);
						try {
							await deleteChapter(novelId, deleting.id);
							setDeleting(null);
							setChapters(await listChapters(novelId));
						} catch (error) {
							setDeleteError(errorText(error));
							return false;
						} finally {
							setDeleteBusy(false);
						}
						return true;
					}}
				/>
			)}
		</>
	);
}

function DeleteChapterDialog({
	novelId,
	chapter,
	busy,
	error,
	onCancel,
	onConfirm,
}: {
	novelId: string;
	chapter: ChapterSummary;
	busy: boolean;
	error: string | null;
	onCancel: () => void;
	/** Resolves false when the delete failed, so the memo count is read again. */
	onConfirm: () => Promise<boolean>;
}) {
	const preview = useDeletePreview(() =>
		chapterDeletePreview(novelId, chapter.id),
	);
	return (
		<ConfirmDialog
			title="챕터 삭제"
			confirmLabel="챕터 삭제"
			busyLabel="삭제 중…"
			danger
			busy={busy}
			error={error}
			confirmDisabled={preview.state.status !== "ready"}
			onCancel={onCancel}
			onConfirm={async () => {
				if (!(await onConfirm())) void preview.reload();
			}}
			testId="delete-chapter-dialog"
		>
			<p>
				<strong>{chapter.title}</strong>
			</p>
			<p>챕터와 이 챕터의 스냅샷이 즉시 영구 삭제되며 되돌릴 수 없습니다</p>
			<DeleteMemoNote state={preview.state} reload={preview.reload} />
		</ConfirmDialog>
	);
}
