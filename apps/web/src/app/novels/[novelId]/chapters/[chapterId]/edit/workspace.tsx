"use client";

import {
	type Chapter,
	type ChapterSummary,
	type Doc,
	docSchema,
} from "@novelist/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, Dialog } from "../../../../../../components/dialog";
import { WorkHeader } from "../../../../../../components/work-header";
import {
	ApiRequestError,
	errorCode,
	errorText,
} from "../../../../../../lib/api";
import {
	clearDraft,
	type Draft,
	writeDraft,
} from "../../../../../../lib/draft";
import { editorExtensions } from "../../../../../../lib/editor-extensions";
import { formatDateTime, formatTime } from "../../../../../../lib/format";
import { getChapter, saveChapterBody } from "../../../../../../lib/novels";
import { SnapshotPanel } from "./snapshot-panel";

const DRAFT_INTERVAL_MS = 3000;

type SaveStatus =
	| "clean"
	| "dirty"
	| "saving"
	| "saved"
	| "failed"
	| "conflict";

type LocalDraft =
	| { state: "none" }
	| { state: "kept"; at: number }
	| { state: "failed" };

type Props = {
	userId: string;
	novelId: string;
	novelTitle: string;
	chapter: Chapter;
	chapters: ChapterSummary[];
	/** A local draft newer than the server body; blocks editing until chosen. */
	draft: Draft | null;
};

export function EditorWorkspace({
	userId,
	novelId,
	novelTitle,
	chapter,
	chapters,
	draft,
}: Props) {
	const router = useRouter();
	const chapterId = chapter.id;

	const [recovery, setRecovery] = useState<Draft | null>(draft);
	const [status, setStatus] = useState<SaveStatus>("clean");
	const [recovered, setRecovered] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [sizeError, setSizeError] = useState(false);
	// currentUpdatedAt from the 409 (null if the server did not say).
	const [conflict, setConflict] = useState<{ current: number | null } | null>(
		null,
	);
	const [local, setLocal] = useState<LocalDraft>({ state: "none" });
	const [isEmpty, setIsEmpty] = useState(false);
	const [snapshotsOpen, setSnapshotsOpen] = useState(false);
	const [reloadOpen, setReloadOpen] = useState(false);
	const [reloadBusy, setReloadBusy] = useState(false);
	const [reloadError, setReloadError] = useState<string | null>(null);
	const [leaveHref, setLeaveHref] = useState<string | null>(null);

	const baseRef = useRef(chapter.updatedAt);
	const editVersionRef = useRef(0);
	// JSON of the last server-confirmed body, to tell real edits from no-op editor updates.
	const savedJsonRef = useRef<string | null>(null);
	const dirtyRef = useRef(false);
	const savingRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const flushRef = useRef<() => void>(() => {});

	const cancelDraftTimer = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);

	const scheduleDraft = useCallback(() => {
		if (timerRef.current) return;
		timerRef.current = setTimeout(() => flushRef.current(), DRAFT_INTERVAL_MS);
	}, []);

	const editor = useEditor({
		extensions: editorExtensions,
		content: chapter.body,
		editable: !draft,
		immediatelyRender: false,
		shouldRerenderOnTransaction: true,
		editorProps: {
			attributes: {
				class: "prose editor-prose",
				"aria-label": "본문",
				"data-testid": "editor-content",
			},
		},
		onCreate: ({ editor: e }) => {
			savedJsonRef.current = JSON.stringify(e.getJSON());
			setIsEmpty(e.isEmpty);
		},
		onUpdate: ({ editor: e }) => {
			// ProseMirror can report an update after a flush without changing the document
			// (e.g. right after save); that is not an edit.
			if (JSON.stringify(e.getJSON()) === savedJsonRef.current) return;
			editVersionRef.current += 1;
			dirtyRef.current = true;
			setIsEmpty(e.isEmpty);
			setStatus((s) =>
				s === "saving" || s === "conflict" || s === "failed" ? s : "dirty",
			);
			scheduleDraft();
		},
	});

	const flushDraft = useCallback(() => {
		timerRef.current = null;
		if (!editor || !dirtyRef.current) return;
		const at = writeDraft(userId, chapterId, editor.getJSON() as Doc);
		setLocal(at === null ? { state: "failed" } : { state: "kept", at });
	}, [editor, userId, chapterId]);

	flushRef.current = flushDraft;

	useEffect(() => cancelDraftTimer, [cancelDraftTimer]);

	/** Replaces the editor content with server-confirmed state and resets save bookkeeping. */
	const adopt = useCallback(
		(next: Chapter) => {
			editor?.commands.setContent(next.body, { emitUpdate: false });
			setIsEmpty(editor?.isEmpty ?? false);
			savedJsonRef.current = JSON.stringify(editor?.getJSON());
			baseRef.current = next.updatedAt;
			cancelDraftTimer();
			clearDraft(userId, chapterId);
			dirtyRef.current = false;
			editVersionRef.current += 1;
			setLocal({ state: "none" });
			setConflict(null);
			setSizeError(false);
			setSaveError(null);
			setRecovered(false);
			setStatus("clean");
		},
		[editor, userId, chapterId, cancelDraftTimer],
	);

	/** `expected` is the version the server must still hold; overwrite passes the 409's value. */
	const save = useCallback(
		async (expected: number = baseRef.current): Promise<boolean> => {
			if (!editor || savingRef.current) return false;
			// Text typed an instant ago may still sit in the DOM (e.g. an IME-style insert
			// followed straight by Cmd/Ctrl+S); read it into the document before serialising.
			(
				editor.view as unknown as { domObserver?: { flush: () => void } }
			).domObserver?.flush();
			const sentJson = JSON.stringify(editor.getJSON());
			const parsed = docSchema.safeParse(editor.getJSON());
			if (!parsed.success) {
				setSaveError("본문 형식이 올바르지 않아 저장하지 못했습니다");
				setStatus("failed");
				return false;
			}
			const version = editVersionRef.current;
			savingRef.current = true;
			setStatus("saving");
			setSaveError(null);
			try {
				const updatedAt = await saveChapterBody(
					novelId,
					chapterId,
					parsed.data,
					expected,
				);
				baseRef.current = updatedAt;
				savedJsonRef.current = sentJson;
				setConflict(null);
				setSizeError(false);
				setSavedAt(Date.now());
				if (
					editVersionRef.current === version ||
					JSON.stringify(editor.getJSON()) === savedJsonRef.current
				) {
					cancelDraftTimer();
					clearDraft(userId, chapterId);
					dirtyRef.current = false;
					setLocal({ state: "none" });
					setRecovered(false);
					setStatus("saved");
				} else {
					// Typed while the request was in flight: still unsaved, keep the draft.
					setStatus("dirty");
					scheduleDraft();
				}
				return true;
			} catch (error) {
				const code = errorCode(error);
				if (code === "version_conflict") {
					setConflict({
						current:
							error instanceof ApiRequestError
								? (error.currentUpdatedAt ?? null)
								: null,
					});
					setStatus("conflict");
				} else {
					if (code === "payload_too_large") setSizeError(true);
					else setSaveError(errorText(error));
					setStatus("failed");
				}
				flushRef.current();
				return false;
			} finally {
				savingRef.current = false;
			}
		},
		[editor, novelId, chapterId, userId, cancelDraftTimer, scheduleDraft],
	);

	const saveRef = useRef(save);
	saveRef.current = save;

	async function overwrite() {
		let current = conflict?.current ?? null;
		if (current === null) {
			try {
				current = (await getChapter(novelId, chapterId)).updatedAt;
			} catch (error) {
				setSaveError(errorText(error));
				return;
			}
		}
		await save(current);
	}

	async function reloadFromServer() {
		setReloadBusy(true);
		setReloadError(null);
		try {
			adopt(await getChapter(novelId, chapterId));
			setReloadOpen(false);
		} catch (error) {
			setReloadError(errorText(error));
		} finally {
			setReloadBusy(false);
		}
	}

	function recover() {
		if (!recovery || !editor) return;
		editor.commands.setContent(recovery.body, { emitUpdate: false });
		setIsEmpty(editor.isEmpty);
		editor.setEditable(true);
		editVersionRef.current += 1;
		dirtyRef.current = true;
		setRecovered(true);
		setStatus("dirty");
		setLocal({ state: "kept", at: recovery.savedAt });
		setRecovery(null);
	}

	function discardDraft() {
		if (!editor) return;
		clearDraft(userId, chapterId);
		editor.setEditable(true);
		setRecovery(null);
	}

	// Cmd/Ctrl+S saves instead of the browser's "save page".
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				// ProseMirror skips its own flush while it is in or near a composition, so text
				// typed just before the shortcut may still sit in the DOM and would otherwise
				// land after the save snapshot, leaving the editor dirty again.
				(
					editor?.view as unknown as
						| { domObserver?: { forceFlush(): void } }
						| undefined
				)?.domObserver?.forceFlush();
				if (dirtyRef.current) void saveRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [editor]);

	// Closing or reloading the tab with unsaved text asks first.
	useEffect(() => {
		const onUnload = (event: BeforeUnloadEvent) => {
			if (dirtyRef.current) {
				event.preventDefault();
				event.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", onUnload);
		return () => window.removeEventListener("beforeunload", onUnload);
	}, []);

	// In-app navigation: intercept link clicks while there are unsaved changes.
	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			if (!dirtyRef.current || event.defaultPrevented || event.button !== 0)
				return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
				return;
			const anchor = (event.target as Element).closest?.("a[href]");
			if (!anchor || (anchor as HTMLAnchorElement).target === "_blank") return;
			const url = new URL((anchor as HTMLAnchorElement).href);
			if (url.origin !== location.origin) return;
			event.preventDefault();
			event.stopPropagation();
			setLeaveHref(url.pathname + url.search);
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, []);

	function leave(href: string) {
		dirtyRef.current = false;
		router.push(href);
	}

	const unsaved = status !== "clean" && status !== "saved";
	const locked = recovery !== null;
	const bold = editor?.isActive("bold") ?? false;

	const statusLabel = {
		clean: "변경 없음",
		dirty: recovered ? "복구됨 · 저장하지 않은 변경" : "저장하지 않은 변경",
		saving: "저장 중…",
		saved: savedAt ? `저장됨 ${formatTime(savedAt)}` : "저장됨",
		failed: "저장 실패 · 다시 시도",
		conflict: "저장 충돌 · 선택 필요",
	}[status];

	return (
		<div className="editor-shell">
			<WorkHeader>
				<Link href={`/novels/${novelId}`}>{novelTitle}</Link> ›{" "}
				<span aria-current="page">{chapter.title}</span>
			</WorkHeader>

			<div
				className="editor-grid"
				data-panel={snapshotsOpen ? "open" : "closed"}
			>
				<nav className="chapter-nav" aria-label="챕터 탐색">
					<Link href={`/novels/${novelId}`} className="nav-link">
						← 챕터 목록
					</Link>
					<ol className="nav-list">
						{chapters.map((c) => (
							<li key={c.id}>
								<Link
									href={`/novels/${novelId}/chapters/${c.id}/edit`}
									className="nav-link"
									aria-current={c.id === chapterId ? "page" : undefined}
								>
									{c.title}
								</Link>
							</li>
						))}
					</ol>
				</nav>

				<main className="editor-main">
					{recovery && (
						<div
							className="notice notice-warning"
							data-testid="recovery-banner"
						>
							<p>
								<strong>이 브라우저에 더 최근의 초안이 있습니다</strong>
							</p>
							<p className="muted" data-testid="recovery-time">
								초안 보관 시각: {formatDateTime(recovery.savedAt)}
							</p>
							<div className="form-actions">
								<button
									type="button"
									className="btn btn-primary"
									onClick={recover}
									data-testid="recovery-restore"
								>
									복구
								</button>
								<button
									type="button"
									className="btn"
									onClick={discardDraft}
									data-testid="recovery-discard"
								>
									버리기
								</button>
							</div>
							<p className="muted">
								버리면 이 브라우저의 초안이 삭제되고 서버에 저장된 본문을 엽니다
							</p>
						</div>
					)}

					{status === "conflict" && (
						<div
							role="alert"
							className="notice notice-warning"
							data-testid="conflict-banner"
						>
							<p>
								다른 곳에서 이 챕터가 변경되어 저장하지 못했습니다. 현재 입력한
								내용은 이 화면에 남아 있습니다
							</p>
							<div className="form-actions">
								<button
									type="button"
									className="btn btn-danger"
									disabled={savingRef.current}
									onClick={overwrite}
									data-testid="conflict-overwrite"
								>
									내 내용으로 덮어쓰기
								</button>
								<button
									type="button"
									className="btn"
									onClick={() => {
										setReloadError(null);
										setReloadOpen(true);
									}}
									data-testid="conflict-reload"
								>
									서버 본문 다시 불러오기
								</button>
							</div>
							<p className="muted">
								서버에 저장된 본문을 현재 입력한 내용으로 대체합니다
							</p>
						</div>
					)}

					<div className="editor-toolbar" role="toolbar" aria-label="본문 도구">
						<h1 className="editor-title">{chapter.title}</h1>
						<button
							type="button"
							className="btn"
							aria-pressed={bold}
							disabled={locked}
							onClick={() => editor?.chain().focus().toggleBold().run()}
							data-testid="tool-bold"
						>
							강조
						</button>
						<button
							type="button"
							className="btn"
							disabled={locked}
							onClick={() => editor?.chain().focus().setHorizontalRule().run()}
							data-testid="tool-scene-break"
						>
							장면 전환
						</button>
						<button
							type="button"
							className="btn btn-primary"
							disabled={
								locked ||
								status === "saving" ||
								status === "conflict" ||
								!unsaved
							}
							onClick={() => void save()}
							data-testid="save-button"
						>
							저장
						</button>
						<button
							type="button"
							className="btn"
							disabled={locked}
							aria-pressed={snapshotsOpen}
							onClick={() => setSnapshotsOpen((v) => !v)}
							data-testid="snapshot-toggle"
						>
							스냅샷
						</button>
						<Link
							href={`/novels/${novelId}/chapters/${chapterId}/read`}
							className="btn btn-link"
							data-testid="to-reader"
						>
							읽기
						</Link>
					</div>

					<div className="save-row">
						<span
							role="status"
							className="save-status"
							data-state={status}
							data-testid="save-status"
						>
							{statusLabel}
						</span>
						<span className="muted" data-testid="local-draft-status">
							{local.state === "kept" &&
								`이 브라우저에 초안 보관됨 · ${formatTime(local.at)}`}
							{local.state === "failed" &&
								"이 브라우저에 초안을 보관하지 못했습니다. 서버에 저장해 주세요"}
						</span>
					</div>

					{sizeError && (
						<p role="alert" className="form-alert" data-testid="size-error">
							본문 크기가 저장 한도(1MB)를 초과했습니다. 내용을 줄이거나 챕터를
							나누어 다시 저장해 주세요. 입력한 내용은 에디터에 그대로 남아
							있습니다
						</p>
					)}
					{saveError && (
						<p role="alert" className="form-alert" data-testid="save-error">
							{saveError}
						</p>
					)}

					<div className="editor-frame" aria-busy={!editor}>
						{!editor && <p className="muted">에디터를 불러오는 중…</p>}
						{isEmpty && editor && (
							<p className="editor-placeholder" aria-hidden="true">
								첫 문장을 입력하세요
							</p>
						)}
						<EditorContent editor={editor} />
					</div>
				</main>

				{snapshotsOpen && (
					<SnapshotPanel
						novelId={novelId}
						chapterId={chapterId}
						unsaved={unsaved}
						onRestored={adopt}
						onClose={() => setSnapshotsOpen(false)}
					/>
				)}
			</div>

			{reloadOpen && (
				<ConfirmDialog
					title="서버 본문 다시 불러오기"
					confirmLabel="서버 본문 다시 불러오기"
					busyLabel="불러오는 중…"
					busy={reloadBusy}
					error={reloadError}
					onCancel={() => setReloadOpen(false)}
					onConfirm={reloadFromServer}
					testId="reload-dialog"
				>
					<p>
						서버 본문을 다시 불러오면 저장하지 않은 수정 내용과 이 챕터의 로컬
						초안을 버립니다
					</p>
				</ConfirmDialog>
			)}

			{leaveHref && (
				<Dialog
					title="저장하지 않은 변경이 있습니다"
					onClose={() => setLeaveHref(null)}
					testId="leave-dialog"
				>
					<p>이동하기 전에 변경 내용을 저장할지 선택해 주세요.</p>
					{saveError && (
						<p role="alert" className="form-alert">
							{saveError}
						</p>
					)}
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={() => setLeaveHref(null)}
							data-testid="leave-stay"
						>
							계속 편집
						</button>
						<button
							type="button"
							className="btn btn-danger-outline"
							onClick={() => {
								cancelDraftTimer();
								clearDraft(userId, chapterId);
								leave(leaveHref);
							}}
							data-testid="leave-discard"
						>
							저장하지 않고 이동
						</button>
						<button
							type="button"
							className="btn btn-primary"
							disabled={status === "saving" || status === "conflict"}
							onClick={async () => {
								if (await save()) leave(leaveHref);
							}}
							data-testid="leave-save"
						>
							저장 후 이동
						</button>
					</div>
				</Dialog>
			)}
		</div>
	);
}
