"use client";

import {
	type Annotation,
	type Chapter,
	type ChapterSummary,
	type Doc,
	docSchema,
} from "@novelist/shared";
import type { MarkType } from "@tiptap/pm/model";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, Dialog } from "../../../../../../components/dialog";
import { MemoWorkspace } from "../../../../../../components/memo-workspace";
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
import {
	ANNOTATION_MARK,
	editorExtensions,
} from "../../../../../../lib/editor-extensions";
import { formatDateTime, formatTime } from "../../../../../../lib/format";
import { createAnnotation, withLiveMarks } from "../../../../../../lib/memos";
import { getChapter, saveChapterBody } from "../../../../../../lib/novels";
import type { MemoGuard } from "../../../../../../lib/use-memo-guard";
import { type AddState, AnnotationPanel } from "./annotation-panel";
import { SnapshotPanel } from "./snapshot-panel";

const DRAFT_INTERVAL_MS = 3000;

const annotationType = (editor: Editor) =>
	editor.schema.marks[ANNOTATION_MARK] as MarkType;

type SaveStatus =
	| "clean"
	| "dirty"
	| "saving"
	| "saved"
	| "failed"
	| "conflict";

type Panel = "memo" | "annotation" | "snapshot";

type Outcome = "ok" | "conflict" | "failed" | "busy";

const OVERLAP_HINT =
	"이미 주석이 있는 범위와 겹쳐 추가할 수 없습니다. 다른 범위를 선택해 주세요";
const SELECT_HINT = "주석을 붙일 본문을 선택해 주세요";

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
	const [panel, setPanel] = useState<Panel | null>(null);
	const [memoMounted, setMemoMounted] = useState(false);
	const [annDraft, setAnnDraft] = useState<{
		from: number;
		to: number;
		quote: string;
	} | null>(null);
	const [addState, setAddState] = useState<AddState>({ status: "idle" });
	const [annNotice, setAnnNotice] = useState<string | null>(null);
	const [annRefresh, setAnnRefresh] = useState(0);
	const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
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
	// Annotation mark edits that are bookkeeping, not text the member typed.
	const silentRef = useRef(false);
	// An annotation being added: its mark is in the editor but not confirmed by the server yet.
	const pendingAnnRef = useRef<{ markId: string; body: string } | null>(null);
	const memoGuardRef = useRef<MemoGuard | null>(null);

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
			if (silentRef.current) {
				if (!dirtyRef.current)
					savedJsonRef.current = JSON.stringify(e.getJSON());
				return;
			}
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
			pendingAnnRef.current = null;
			setAnnDraft(null);
			setAddState({ status: "idle" });
			setAnnRefresh((n) => n + 1);
		},
		[editor, userId, chapterId, cancelDraftTimer],
	);

	/** Adds or removes an annotation mark without counting it as an edit. */
	const markSilently = useCallback(
		(change: (tr: NonNullable<typeof editor>["state"]["tr"]) => void) => {
			if (!editor) return;
			const tr = editor.state.tr.setMeta("addToHistory", false);
			change(tr);
			if (!tr.docChanged) return;
			silentRef.current = true;
			try {
				editor.view.dispatch(tr);
			} finally {
				silentRef.current = false;
			}
		},
		[editor],
	);

	const removeMark = useCallback(
		(markId: string) => {
			if (!editor) return;
			const type = annotationType(editor);
			const doc = editor.state.doc;
			markSilently((tr) => {
				doc.descendants((node, pos) => {
					for (const m of node.marks)
						if (m.type === type && m.attrs.id === markId)
							tr.removeMark(pos, pos + node.nodeSize, m);
				});
			});
		},
		[editor, markSilently],
	);

	/**
	 * Runs one server write of the current document (plain save, or annotation + body together)
	 * and keeps the save bookkeeping in one place. `expected` is the version the server must
	 * still hold; overwrite passes the 409's value.
	 */
	const persist = useCallback(
		async (
			expected: number,
			run: (doc: Doc, expected: number) => Promise<number>,
		): Promise<{ outcome: Outcome; message?: string }> => {
			if (!editor || savingRef.current) return { outcome: "busy" };
			// Text typed an instant ago may still sit in the DOM (e.g. an IME-style insert
			// followed straight by Cmd/Ctrl+S); read it into the document before serialising.
			(
				editor.view as unknown as { domObserver?: { flush: () => void } }
			).domObserver?.flush();
			const sentJson = JSON.stringify(editor.getJSON());
			const parsed = docSchema.safeParse(editor.getJSON());
			if (!parsed.success) {
				const message = "본문 형식이 올바르지 않아 저장하지 못했습니다";
				setSaveError(message);
				setStatus("failed");
				return { outcome: "failed", message };
			}
			const version = editVersionRef.current;
			savingRef.current = true;
			setStatus("saving");
			setSaveError(null);
			try {
				const updatedAt = await run(parsed.data, expected);
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
				// The server re-judged every annotation's state against the saved body.
				setAnnRefresh((n) => n + 1);
				return { outcome: "ok" };
			} catch (error) {
				const code = errorCode(error);
				flushRef.current();
				if (code === "version_conflict") {
					setConflict({
						current:
							error instanceof ApiRequestError
								? (error.currentUpdatedAt ?? null)
								: null,
					});
					setStatus("conflict");
					return { outcome: "conflict" };
				}
				if (code === "payload_too_large") setSizeError(true);
				else setSaveError(errorText(error));
				setStatus("failed");
				return { outcome: "failed", message: errorText(error) };
			} finally {
				savingRef.current = false;
			}
		},
		[editor, userId, chapterId, cancelDraftTimer, scheduleDraft],
	);

	const save = useCallback(
		async (expected: number = baseRef.current): Promise<boolean> =>
			(
				await persist(expected, (doc, exp) =>
					saveChapterBody(novelId, chapterId, doc, exp),
				)
			).outcome === "ok",
		[persist, novelId, chapterId],
	);

	const addAnnotationRun =
		(markId: string, body: string) => async (doc: Doc, expected: number) =>
			(
				await createAnnotation(novelId, chapterId, {
					markId,
					body,
					chapterBody: doc,
					expectedUpdatedAt: expected,
				})
			).updatedAt;

	/** Settles the add form after a combined annotation + body save attempt. */
	function finishAnnotation(result: { outcome: Outcome; message?: string }) {
		const pending = pendingAnnRef.current;
		if (result.outcome === "ok") {
			pendingAnnRef.current = null;
			setAnnDraft(null);
			setAddState({ status: "idle" });
			setAnnNotice("주석과 본문이 저장되었습니다");
		} else if (result.outcome === "conflict") {
			// the mark stays so "내 내용으로 덮어쓰기" can resend annotation and body together
			setAddState({
				status: "conflict",
				error:
					"다른 곳에서 이 챕터가 변경되어 주석과 본문 모두 저장되지 않았습니다. 본문 위의 선택지에서 덮어쓰기 또는 다시 불러오기를 선택해 주세요",
			});
		} else {
			if (pending) removeMark(pending.markId);
			pendingAnnRef.current = null;
			setAddState({
				status: "failed",
				error:
					`주석과 본문 모두 저장되지 않았습니다. ${result.message ?? ""}`.trim(),
			});
		}
	}

	function openAnnotationForm() {
		if (!editor) return;
		const { from, to } = editor.state.selection;
		setAnnNotice(null);
		setAddState({ status: "idle" });
		setAnnDraft({
			from,
			to,
			quote: editor.state.doc.textBetween(from, to, " "),
		});
		setPanel("annotation");
	}

	async function submitAnnotation(body: string) {
		if (!editor || !annDraft || savingRef.current) return;
		(
			editor.view as unknown as { domObserver?: { flush: () => void } }
		).domObserver?.flush();
		const { from, to, quote } = annDraft;
		const type = annotationType(editor);
		const doc = editor.state.doc;
		if (
			to > doc.content.size ||
			doc.textBetween(from, to, " ") !== quote ||
			doc.rangeHasMark(from, to, type)
		) {
			setAddState({
				status: "failed",
				error: "선택한 범위가 바뀌었습니다. 본문에서 다시 선택해 주세요",
			});
			return;
		}
		const markId = crypto.randomUUID();
		markSilently((tr) => {
			tr.addMark(from, to, type.create({ id: markId }));
		});
		pendingAnnRef.current = { markId, body };
		setAnnNotice(null);
		setAddState({ status: "saving" });
		finishAnnotation(
			await persist(baseRef.current, addAnnotationRun(markId, body)),
		);
	}

	function cancelAnnotation() {
		const pending = pendingAnnRef.current;
		if (pending) {
			removeMark(pending.markId);
			pendingAnnRef.current = null;
			// the conflict was only about this annotation: nothing left to resolve
			if (!dirtyRef.current) {
				setConflict(null);
				setStatus("clean");
			}
		}
		setAnnDraft(null);
		setAddState({ status: "idle" });
	}

	function gotoAnnotation(annotation: Annotation) {
		setSelectedMarkId(annotation.markId);
		editor?.view.dom
			.querySelector(`[data-annotation-id="${CSS.escape(annotation.markId)}"]`)
			?.scrollIntoView({ block: "center" });
	}

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
		const pending = pendingAnnRef.current;
		if (pending) {
			setAddState({ status: "saving" });
			finishAnnotation(
				await persist(current, addAnnotationRun(pending.markId, pending.body)),
			);
		} else {
			await save(current);
		}
	}

	async function reloadFromServer() {
		setReloadBusy(true);
		setReloadError(null);
		try {
			adopt(await withLiveMarks(novelId, await getChapter(novelId, chapterId)));
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
			if (dirtyRef.current || memoGuardRef.current?.dirty) {
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
			if (
				!(dirtyRef.current || memoGuardRef.current?.dirty) ||
				event.defaultPrevented ||
				event.button !== 0
			)
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
		if (memoGuardRef.current) memoGuardRef.current.dirty = false;
		router.push(href);
	}

	const unsaved = status !== "clean" && status !== "saved";
	const locked = recovery !== null;
	const bold = editor?.isActive("bold") ?? false;

	function togglePanel(next: Panel) {
		if (next === "memo") setMemoMounted(true);
		setPanel((current) => (current === next ? null : next));
	}

	// Why "주석 추가" is unavailable right now (null = available). Read on every render:
	// the editor re-renders on each transaction, selection changes included.
	const selection = editor?.state.selection;
	const selectedText =
		editor && selection && !selection.empty
			? editor.state.doc.textBetween(selection.from, selection.to, " ")
			: "";
	const overlapsAnnotation =
		editor && selection && selectedText.trim() !== ""
			? editor.state.doc.rangeHasMark(
					selection.from,
					selection.to,
					annotationType(editor),
				)
			: false;
	const addBlocked =
		selectedText.trim() === ""
			? SELECT_HINT
			: overlapsAnnotation
				? OVERLAP_HINT
				: status === "saving" || status === "conflict"
					? "저장이 끝난 뒤 추가할 수 있습니다"
					: null;

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

			<div className="editor-grid" data-panel={panel ? "open" : "closed"}>
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
							aria-pressed={panel === "snapshot"}
							onClick={() => togglePanel("snapshot")}
							data-testid="snapshot-toggle"
						>
							스냅샷
						</button>
						<button
							type="button"
							className="btn"
							disabled={locked}
							aria-pressed={panel === "memo"}
							onClick={() => togglePanel("memo")}
							data-testid="memo-toggle"
						>
							메모
						</button>
						<button
							type="button"
							className="btn"
							disabled={locked}
							aria-pressed={panel === "annotation"}
							onClick={() => togglePanel("annotation")}
							data-testid="annotation-toggle"
						>
							주석
						</button>
						<button
							type="button"
							className="btn"
							disabled={locked || addBlocked !== null}
							aria-describedby="annotation-add-hint"
							onClick={openAnnotationForm}
							data-testid="annotation-add"
						>
							주석 추가
						</button>
						<span
							id="annotation-add-hint"
							className="muted"
							data-testid="annotation-add-hint"
						>
							{addBlocked}
						</span>
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

					{selectedMarkId && (
						<style>{`.annotation-mark[data-annotation-id="${CSS.escape(selectedMarkId)}"]{outline:var(--focus-width) solid var(--color-focus)}`}</style>
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

				{panel === "snapshot" && (
					<SnapshotPanel
						novelId={novelId}
						chapterId={chapterId}
						unsaved={unsaved}
						onRestored={async (restored) =>
							adopt(await withLiveMarks(novelId, restored))
						}
						onClose={() => setPanel(null)}
					/>
				)}
				{panel === "annotation" && (
					<AnnotationPanel
						novelId={novelId}
						chapterId={chapterId}
						refreshKey={annRefresh}
						adding={annDraft}
						addState={addState}
						notice={annNotice}
						onSubmitAdd={submitAnnotation}
						onCancelAdd={cancelAnnotation}
						onSelect={gotoAnnotation}
						onDeleted={(gone) => removeMark(gone.markId)}
						onClose={() => setPanel(null)}
					/>
				)}
				{/* kept mounted once opened so closing the panel never drops an unsaved memo */}
				{memoMounted && (
					<aside
						className="snapshot-panel"
						aria-label="메모"
						hidden={panel !== "memo"}
						data-testid="memo-panel"
					>
						<div className="snapshot-head">
							<h2 className="panel-title">메모</h2>
							<button
								type="button"
								className="btn"
								onClick={() => setPanel(null)}
								data-testid="memo-panel-close"
							>
								닫기
							</button>
						</div>
						<Link href="/memos" className="muted" data-testid="memo-panel-all">
							전체 메모 화면으로
						</Link>
						<MemoWorkspace
							variant="panel"
							context={{ novelId, chapterId }}
							guardRef={memoGuardRef}
						/>
					</aside>
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
					{annDraft && (
						<p data-testid="reload-dialog-annotation-note">
							추가 중인 주석도 함께 버립니다. 불러온 뒤 새 본문에서 범위를 다시
							선택해 주세요
						</p>
					)}
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
								if (dirtyRef.current && !(await save())) return;
								const memo = memoGuardRef.current;
								if (memo?.dirty && !(await memo.save())) return;
								leave(leaveHref);
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
