"use client";

import {
	emptyDoc,
	MEMO_TITLE_MAX_LENGTH,
	type Memo,
	type MemoDoc,
	memoDocSchema,
} from "@novelist/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import {
	type MutableRefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { ApiRequestError, errorCode, errorReason, errorText } from "../lib/api";
import { memoExtensions } from "../lib/editor-extensions";
import { formatTime } from "../lib/format";
import {
	createMemo,
	deleteMemo,
	getMemo,
	type MemoScope,
	updateMemo,
} from "../lib/memos";
import { listChapters, listNovels } from "../lib/novels";
import { useList } from "../lib/use-list";
import type { MemoGuard } from "../lib/use-memo-guard";
import { ConfirmDialog } from "./dialog";

const SIZE_ERROR =
	"메모 크기가 저장 한도(200KB)를 초과했습니다. 내용을 줄여 다시 저장해 주세요. 입력한 내용은 에디터에 그대로 남아 있습니다";

type Result = "failed" | "conflict" | "toolarge" | null;

type Snapshot = {
	title: string;
	body: string;
	aiReference: boolean;
	scope: string;
};

const KINDS = [
	{ kind: "free", label: "자유" },
	{ kind: "novel", label: "소설" },
	{ kind: "chapter", label: "챕터" },
] as const;

const scopeKey = (s: MemoScope) =>
	`${s.kind}:${s.kind === "free" ? "" : (s.novelId ?? "")}:${s.kind === "chapter" ? (s.chapterId ?? "") : ""}`;

type Props = {
	/** null = a memo that does not exist yet; it is created on the first save. */
	memo: Memo | null;
	/** Scope a new memo starts in. */
	defaultScope: MemoScope;
	/** The host reads this to stop navigation from dropping unsaved text. */
	guardRef?: MutableRefObject<MemoGuard | null>;
	onSaved: (memo: Memo) => void;
	onDeleted?: (memoId: string) => void;
	/** Shown instead of the delete button for a memo that does not exist yet. */
	onCancelNew?: () => void;
};

export function MemoEditor({
	memo,
	defaultScope,
	guardRef,
	onSaved,
	onDeleted,
	onCancelNew,
}: Props) {
	const ids = useId();
	const initialScope: MemoScope = memo
		? {
				kind: memo.kind,
				novelId: memo.novelId ?? undefined,
				chapterId: memo.chapterId ?? undefined,
			}
		: defaultScope;

	const [title, setTitle] = useState(memo?.title ?? "");
	const [aiReference, setAiReference] = useState(memo?.aiReference ?? false);
	const [scope, setScope] = useState<MemoScope>(initialScope);
	const [result, setResult] = useState<Result>(null);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [conflict, setConflict] = useState<{ current: number | null } | null>(
		null,
	);
	const [reloadOpen, setReloadOpen] = useState(false);
	const [reloadBusy, setReloadBusy] = useState(false);
	const [reloadError, setReloadError] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const memoRef = useRef(memo);
	const baseRef = useRef(memo?.updatedAt ?? 0);
	const savingRef = useRef(false);
	const savedRef = useRef<Snapshot | null>(null);

	const editor = useEditor({
		extensions: memoExtensions,
		content: memo?.body ?? emptyDoc(),
		immediatelyRender: false,
		shouldRerenderOnTransaction: true,
		editorProps: {
			attributes: {
				class: "prose editor-prose",
				"aria-label": "메모 내용",
				"data-testid": "memo-content",
			},
		},
		onCreate: ({ editor: e }) => {
			savedRef.current = {
				title: (memo?.title ?? "").trim(),
				body: JSON.stringify(e.getJSON()),
				aiReference: memo?.aiReference ?? false,
				scope: scopeKey(initialScope),
			};
		},
	});

	const novels = useList(listNovels);
	const chapters = useList(async () =>
		scope.kind === "chapter" && scope.novelId
			? listChapters(scope.novelId)
			: [],
	);
	const loadChaptersRef = useRef(chapters.reload);
	loadChaptersRef.current = chapters.reload;
	const chapterNovelId = scope.kind === "chapter" ? scope.novelId : undefined;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the chosen novel changes
	useEffect(() => {
		void loadChaptersRef.current();
	}, [chapterNovelId]);

	const titleTooLong = title.trim().length > MEMO_TITLE_MAX_LENGTH;
	const scopeIncomplete =
		(scope.kind === "novel" && !scope.novelId) ||
		(scope.kind === "chapter" && !scope.chapterId);

	const saved = savedRef.current;
	const dirty =
		saved !== null &&
		editor !== null &&
		(title.trim() !== saved.title ||
			aiReference !== saved.aiReference ||
			scopeKey(scope) !== saved.scope ||
			JSON.stringify(editor.getJSON()) !== saved.body);
	const isNew = memoRef.current === null;

	const save = useCallback(
		async (expected?: number): Promise<boolean> => {
			if (!editor || savingRef.current) return false;
			(
				editor.view as unknown as { domObserver?: { flush: () => void } }
			).domObserver?.flush();
			const trimmed = title.trim();
			if (trimmed.length > MEMO_TITLE_MAX_LENGTH || scopeIncomplete)
				return false;
			const parsed = memoDocSchema.safeParse(editor.getJSON());
			if (!parsed.success) {
				setResult("failed");
				setMessage("메모 형식이 올바르지 않아 저장하지 못했습니다");
				return false;
			}
			const body: MemoDoc = parsed.data;
			const sent: Snapshot = {
				title: trimmed,
				body: JSON.stringify(editor.getJSON()),
				aiReference,
				scope: scopeKey(scope),
			};
			const current = memoRef.current;
			savingRef.current = true;
			setSaving(true);
			setMessage(null);
			try {
				const next = current
					? await updateMemo(current.id, {
							// only a changed scope is re-validated server-side
							scope:
								savedRef.current && sent.scope !== savedRef.current.scope
									? scope
									: undefined,
							title: trimmed || null,
							body,
							aiReference,
							expectedUpdatedAt: expected ?? baseRef.current,
						})
					: await createMemo(scope, {
							title: trimmed || undefined,
							body,
							aiReference,
						});
				memoRef.current = next;
				baseRef.current = next.updatedAt;
				savedRef.current = sent;
				setConflict(null);
				setResult(null);
				setSavedAt(Date.now());
				onSaved(next);
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
					setResult("conflict");
				} else if (code === "payload_too_large") {
					setResult("toolarge");
				} else {
					setResult("failed");
					setMessage(
						errorReason(error) || code === "validation_error"
							? "메모를 저장하지 못했습니다. 소속 선택과 제목 길이를 확인해 주세요"
							: errorText(error),
					);
				}
				return false;
			} finally {
				savingRef.current = false;
				setSaving(false);
			}
		},
		[editor, title, aiReference, scope, scopeIncomplete, onSaved],
	);

	const saveRef = useRef(save);
	saveRef.current = save;
	if (guardRef) {
		guardRef.current = { dirty, save: () => saveRef.current() };
	}
	useEffect(() => {
		return () => {
			if (guardRef) guardRef.current = null;
		};
	}, [guardRef]);

	async function overwrite() {
		const id = memoRef.current?.id;
		let current = conflict?.current ?? null;
		if (current === null && id) {
			try {
				current = (await getMemo(id)).updatedAt;
			} catch (error) {
				setMessage(errorText(error));
				return;
			}
		}
		if (current !== null) await save(current);
	}

	async function reloadFromServer() {
		const id = memoRef.current?.id;
		if (!id || !editor) return;
		setReloadBusy(true);
		setReloadError(null);
		try {
			const fresh = await getMemo(id);
			memoRef.current = fresh;
			baseRef.current = fresh.updatedAt;
			editor.commands.setContent(fresh.body, { emitUpdate: false });
			const next: MemoScope = {
				kind: fresh.kind,
				novelId: fresh.novelId ?? undefined,
				chapterId: fresh.chapterId ?? undefined,
			};
			setTitle(fresh.title ?? "");
			setAiReference(fresh.aiReference);
			setScope(next);
			savedRef.current = {
				title: (fresh.title ?? "").trim(),
				body: JSON.stringify(editor.getJSON()),
				aiReference: fresh.aiReference,
				scope: scopeKey(next),
			};
			setConflict(null);
			setResult(null);
			setMessage(null);
			setReloadOpen(false);
			onSaved(fresh);
		} catch (error) {
			setReloadError(errorText(error));
		} finally {
			setReloadBusy(false);
		}
	}

	async function remove() {
		const id = memoRef.current?.id;
		if (!id) return;
		setDeleteBusy(true);
		setDeleteError(null);
		try {
			await deleteMemo(id);
			if (guardRef?.current) guardRef.current.dirty = false;
			setDeleteOpen(false);
			onDeleted?.(id);
		} catch (error) {
			setDeleteError(errorText(error));
		} finally {
			setDeleteBusy(false);
		}
	}

	const status = saving
		? "saving"
		: result === "conflict"
			? "conflict"
			: result === "toolarge"
				? "toolarge"
				: result === "failed"
					? "failed"
					: dirty
						? "dirty"
						: savedAt
							? "saved"
							: "clean";
	const statusLabel = {
		clean: "변경 없음",
		dirty: "저장하지 않은 변경",
		saving: "저장 중…",
		saved: savedAt ? `저장됨 ${formatTime(savedAt)}` : "저장됨",
		failed: "저장 실패 · 다시 시도",
		conflict: "저장 충돌 · 선택 필요",
		toolarge: "저장 실패 · 크기 초과",
	}[status];

	const bold = editor?.isActive("bold") ?? false;
	const selectedNovel =
		novels.state.status === "ready" ? novels.state.data : [];
	const chapterList =
		chapters.state.status === "ready" ? chapters.state.data : [];

	function chooseKind(kind: MemoScope["kind"]) {
		setScope((prev) =>
			kind === "free"
				? { kind }
				: kind === "novel"
					? { kind, novelId: prev.novelId }
					: { kind, novelId: prev.novelId, chapterId: prev.chapterId },
		);
	}

	return (
		<section
			className="memo-editor"
			aria-label="메모 편집"
			data-testid="memo-editor"
			onKeyDown={(event) => {
				if (
					(event.metaKey || event.ctrlKey) &&
					event.key.toLowerCase() === "s"
				) {
					event.preventDefault();
					// the chapter editor's own Cmd/Ctrl+S must not fire as well
					event.nativeEvent.stopPropagation();
					if (!saving && (dirty || isNew) && result !== "conflict") void save();
				}
			}}
		>
			<div className="field">
				<label htmlFor={`${ids}-title`} className="field-label">
					제목 (선택 · 최대 {MEMO_TITLE_MAX_LENGTH}자)
				</label>
				<input
					id={`${ids}-title`}
					className="input"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					aria-invalid={titleTooLong}
					aria-describedby={`${ids}-title-count`}
					data-testid="memo-title"
				/>
				<p className="field-hint" id={`${ids}-title-count`}>
					{title.trim().length} / {MEMO_TITLE_MAX_LENGTH}자 · 비워 두면 목록에
					본문 첫 줄이 표시됩니다
				</p>
				{titleTooLong && (
					<p
						role="alert"
						className="field-error"
						data-testid="memo-title-error"
					>
						제목은 {MEMO_TITLE_MAX_LENGTH}자 이하로 입력해 주세요
					</p>
				)}
			</div>

			{result === "conflict" && (
				<div
					role="alert"
					className="notice notice-warning"
					data-testid="memo-conflict-banner"
				>
					<p>
						다른 곳에서 이 메모가 변경되어 저장하지 못했습니다. 현재 입력한
						내용은 이 화면에 남아 있습니다
					</p>
					<div className="form-actions">
						<button
							type="button"
							className="btn btn-danger"
							disabled={saving}
							onClick={overwrite}
							data-testid="memo-conflict-overwrite"
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
							data-testid="memo-conflict-reload"
						>
							서버 메모 다시 불러오기
						</button>
					</div>
					<p className="muted">
						서버에 저장된 메모를 현재 입력한 내용으로 대체합니다
					</p>
				</div>
			)}

			<div className="field">
				<span className="field-label" id={`${ids}-body-label`}>
					내용
				</span>
				<div className="editor-toolbar" role="toolbar" aria-label="메모 도구">
					<button
						type="button"
						className="btn"
						aria-pressed={bold}
						onClick={() => editor?.chain().focus().toggleBold().run()}
						data-testid="memo-tool-bold"
					>
						강조
					</button>
					<button
						type="button"
						className="btn"
						onClick={() => editor?.chain().focus().setHorizontalRule().run()}
						data-testid="memo-tool-scene-break"
					>
						장면 전환
					</button>
				</div>
				<div className="editor-frame memo-frame" aria-busy={!editor}>
					{!editor && <p className="muted">에디터를 불러오는 중…</p>}
					<EditorContent editor={editor} />
				</div>
			</div>

			<fieldset className="choice memo-scope">
				<legend className="field-label">소속</legend>
				<div className="choice-row">
					{KINDS.map((k) => (
						<button
							key={k.kind}
							type="button"
							className="btn"
							aria-pressed={scope.kind === k.kind}
							onClick={() => chooseKind(k.kind)}
							data-testid={`memo-scope-${k.kind}`}
						>
							{k.label}
						</button>
					))}
				</div>
				{scope.kind !== "free" && (
					<div className="field">
						<label htmlFor={`${ids}-novel`} className="field-label">
							소설
						</label>
						<select
							id={`${ids}-novel`}
							className="input"
							value={scope.novelId ?? ""}
							onChange={(e) =>
								setScope(
									scope.kind === "novel"
										? { kind: "novel", novelId: e.target.value || undefined }
										: {
												kind: "chapter",
												novelId: e.target.value || undefined,
											},
								)
							}
							data-testid="memo-scope-novel-select"
						>
							<option value="">소설 선택</option>
							{selectedNovel.map((n) => (
								<option key={n.id} value={n.id}>
									{n.title}
								</option>
							))}
						</select>
					</div>
				)}
				{scope.kind === "chapter" && (
					<div className="field">
						<label htmlFor={`${ids}-chapter`} className="field-label">
							챕터
						</label>
						<select
							id={`${ids}-chapter`}
							className="input"
							value={scope.chapterId ?? ""}
							disabled={!scope.novelId}
							onChange={(e) =>
								setScope({
									kind: "chapter",
									novelId: scope.novelId,
									chapterId: e.target.value || undefined,
								})
							}
							data-testid="memo-scope-chapter-select"
						>
							<option value="">챕터 선택</option>
							{chapterList.map((c) => (
								<option key={c.id} value={c.id}>
									{c.title}
								</option>
							))}
						</select>
					</div>
				)}
				{scopeIncomplete && (
					<p className="field-error" data-testid="memo-scope-error">
						{scope.kind === "novel"
							? "소설을 선택해 주세요"
							: "소설과 챕터를 선택해 주세요"}
					</p>
				)}
			</fieldset>

			<div className="field">
				<label className="check">
					<input
						type="checkbox"
						checked={aiReference}
						onChange={(e) => setAiReference(e.target.checked)}
						data-testid="memo-ai-reference"
					/>
					<span>AI 참고 메모</span>
				</label>
				<p className="field-hint">
					표시한 메모만 AI가 읽습니다. 자유 메모가 어느 소설의 AI 요청에
					포함되는지는 AI 연동 단계에서 정해지며, 지금은 표시만 저장됩니다
				</p>
			</div>

			{result === "toolarge" && (
				<p role="alert" className="form-alert" data-testid="memo-size-error">
					{SIZE_ERROR}
				</p>
			)}
			{message && (
				<p role="alert" className="form-alert" data-testid="memo-save-error">
					{message}
				</p>
			)}

			<div className="save-row">
				<button
					type="button"
					className="btn btn-primary"
					disabled={
						saving ||
						result === "conflict" ||
						titleTooLong ||
						scopeIncomplete ||
						(!dirty && !isNew)
					}
					aria-busy={saving}
					onClick={() => void save()}
					data-testid="memo-save"
				>
					저장
				</button>
				<span
					role="status"
					className="save-status"
					data-state={status}
					data-testid="memo-save-status"
				>
					{statusLabel}
				</span>
				{isNew && onCancelNew ? (
					<button
						type="button"
						className="btn"
						onClick={onCancelNew}
						data-testid="memo-cancel-new"
					>
						취소
					</button>
				) : (
					!isNew && (
						<button
							type="button"
							className="btn btn-danger-outline"
							onClick={() => {
								setDeleteError(null);
								setDeleteOpen(true);
							}}
							data-testid="memo-delete"
						>
							삭제
						</button>
					)
				)}
			</div>
			<p className="muted">
				자동 저장되지 않습니다. 화면을 닫기 전에 저장해 주세요
			</p>

			{reloadOpen && (
				<ConfirmDialog
					title="서버 메모 다시 불러오기"
					confirmLabel="서버 메모 다시 불러오기"
					busyLabel="불러오는 중…"
					busy={reloadBusy}
					error={reloadError}
					onCancel={() => setReloadOpen(false)}
					onConfirm={reloadFromServer}
					testId="memo-reload-dialog"
				>
					<p>서버 메모를 다시 불러오면 저장하지 않은 수정 내용을 버립니다</p>
				</ConfirmDialog>
			)}
			{deleteOpen && (
				<ConfirmDialog
					title="메모 삭제"
					confirmLabel="메모 삭제"
					busyLabel="삭제 중…"
					danger
					busy={deleteBusy}
					error={deleteError}
					onCancel={() => setDeleteOpen(false)}
					onConfirm={remove}
					testId="memo-delete-dialog"
				>
					<p>이 메모가 즉시 영구 삭제되며 되돌릴 수 없습니다</p>
				</ConfirmDialog>
			)}
		</section>
	);
}
