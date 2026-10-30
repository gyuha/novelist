"use client";

import { ANNOTATION_BODY_MAX_LENGTH, type Annotation } from "@novelist/shared";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "../../../../../../components/dialog";
import { errorText } from "../../../../../../lib/api";
import { formatDateTime } from "../../../../../../lib/format";
import {
	deleteAnnotation,
	listAnnotations,
	updateAnnotation,
} from "../../../../../../lib/memos";
import { useList } from "../../../../../../lib/use-list";

export type AddState = {
	status: "idle" | "saving" | "failed" | "conflict";
	error?: string;
};

type Filter = "all" | "anchored" | "orphaned";

const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "anchored", label: "연결됨" },
	{ value: "orphaned", label: "위치 잃음" },
];

type Props = {
	novelId: string;
	chapterId: string;
	/** Bumped by the editor after every body save or restore: the server re-judged the states. */
	refreshKey: number;
	/** The selection being annotated, or null while no add form is open. */
	adding: { quote: string } | null;
	addState: AddState;
	/** Shown after an annotation and the body were saved together. */
	notice: string | null;
	onSubmitAdd: (body: string) => void;
	onCancelAdd: () => void;
	onSelect: (annotation: Annotation) => void;
	onDeleted: (annotation: Annotation) => void;
	onClose: () => void;
};

export function AnnotationPanel({
	novelId,
	chapterId,
	refreshKey,
	adding,
	addState,
	notice,
	onSubmitAdd,
	onCancelAdd,
	onSelect,
	onDeleted,
	onClose,
}: Props) {
	const { state, reload } = useList(() => listAnnotations(novelId, chapterId));
	const [filter, setFilter] = useState<Filter>("all");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<Annotation | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const firstRun = useRef(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the editor says states changed
	useEffect(() => {
		if (firstRun.current) {
			firstRun.current = false;
			return;
		}
		void reload();
	}, [refreshKey]);

	const all = state.status === "ready" ? state.data : [];
	const rows = all.filter((a) => filter === "all" || a.state === filter);

	return (
		<aside
			className="snapshot-panel"
			aria-label="주석"
			data-testid="annotation-panel"
		>
			<div className="snapshot-head">
				<h2 className="panel-title">주석</h2>
				<button
					type="button"
					className="btn"
					onClick={onClose}
					data-testid="annotation-close"
				>
					닫기
				</button>
			</div>

			{adding && (
				<AddForm
					quote={adding.quote}
					addState={addState}
					onSubmit={onSubmitAdd}
					onCancel={onCancelAdd}
				/>
			)}
			{notice && (
				<p
					role="status"
					className="form-success"
					data-testid="annotation-notice"
				>
					{notice}
				</p>
			)}

			<fieldset className="choice">
				<legend className="muted">주석 필터</legend>
				<div className="choice-row">
					{FILTERS.map((f) => (
						<button
							key={f.value}
							type="button"
							className="btn"
							aria-pressed={filter === f.value}
							onClick={() => setFilter(f.value)}
							data-testid={`annotation-filter-${f.value}`}
						>
							{f.label}
						</button>
					))}
				</div>
			</fieldset>

			{state.status === "loading" && (
				<p className="muted" aria-busy="true" data-testid="annotation-loading">
					불러오는 중…
				</p>
			)}
			{state.status === "error" && (
				<div>
					<p role="alert" className="form-alert" data-testid="annotation-error">
						{state.message}
					</p>
					<button
						type="button"
						className="btn"
						onClick={reload}
						data-testid="annotation-retry"
					>
						다시 시도
					</button>
				</div>
			)}
			{state.status === "ready" &&
				(all.length === 0 ? (
					<p className="muted" data-testid="annotation-empty">
						아직 주석이 없습니다. 본문에서 텍스트를 선택한 뒤 “주석 추가”를 눌러
						보세요
					</p>
				) : rows.length === 0 ? (
					<p className="muted" data-testid="annotation-no-match">
						이 조건에 맞는 주석이 없습니다
					</p>
				) : (
					<ul className="rows annotation-list" data-testid="annotation-list">
						{rows.map((a) => (
							<li
								key={a.id}
								className="annotation-item"
								data-state={a.state}
								data-testid="annotation-item"
							>
								{editingId === a.id ? (
									<EditForm
										annotation={a}
										novelId={novelId}
										chapterId={chapterId}
										onDone={async () => {
											setEditingId(null);
											await reload();
										}}
										onCancel={() => setEditingId(null)}
									/>
								) : (
									<>
										<div className="annotation-head">
											<span
												className="annotation-state"
												data-state={a.state}
												data-testid="annotation-state"
											>
												{a.state === "anchored" ? "연결됨" : "위치 잃음"}
											</span>
											<span className="row-meta">
												{formatDateTime(a.updatedAt)}
											</span>
										</div>
										<blockquote
											className="annotation-quote"
											data-testid="annotation-quote"
										>
											{a.quote}
										</blockquote>
										<p
											className="annotation-body"
											data-testid="annotation-body"
										>
											{a.body}
										</p>
										{a.state === "orphaned" && (
											<p className="muted" data-testid="annotation-orphan-note">
												연결된 본문이 삭제되었습니다. 이 주석이 연결된 스냅샷을
												복원하면 다시 연결될 수 있습니다
											</p>
										)}
										<div className="form-actions">
											{a.state === "anchored" && (
												<button
													type="button"
													className="btn"
													onClick={() => onSelect(a)}
													data-testid="annotation-goto"
												>
													본문에서 보기
												</button>
											)}
											<button
												type="button"
												className="btn"
												onClick={() => setEditingId(a.id)}
												data-testid="annotation-edit"
											>
												수정
											</button>
											<button
												type="button"
												className="btn btn-danger-outline"
												onClick={() => {
													setDeleteError(null);
													setDeleting(a);
												}}
												data-testid="annotation-delete"
											>
												삭제
											</button>
										</div>
									</>
								)}
							</li>
						))}
					</ul>
				))}

			{deleting && (
				<ConfirmDialog
					title="주석 삭제"
					confirmLabel="주석 삭제"
					busyLabel="삭제 중…"
					danger
					busy={deleteBusy}
					error={deleteError}
					onCancel={() => setDeleting(null)}
					onConfirm={async () => {
						setDeleteBusy(true);
						setDeleteError(null);
						try {
							await deleteAnnotation(novelId, chapterId, deleting.id);
							const gone = deleting;
							setDeleting(null);
							onDeleted(gone);
							await reload();
						} catch (error) {
							setDeleteError(errorText(error));
						} finally {
							setDeleteBusy(false);
						}
					}}
					testId="annotation-delete-dialog"
				>
					<p>
						주석과 본문의 주석 표시가 함께 삭제됩니다. 삭제한 주석은 스냅샷을
						복원해도 되살아나지 않습니다
					</p>
				</ConfirmDialog>
			)}
		</aside>
	);
}

function AddForm({
	quote,
	addState,
	onSubmit,
	onCancel,
}: {
	quote: string;
	addState: AddState;
	onSubmit: (body: string) => void;
	onCancel: () => void;
}) {
	const id = useId();
	const [body, setBody] = useState("");
	const [fieldError, setFieldError] = useState<string>();
	const saving = addState.status === "saving";

	function submit(event: FormEvent) {
		event.preventDefault();
		if (saving) return;
		const trimmed = body.trim();
		const error = !trimmed
			? "주석 내용을 입력해 주세요"
			: trimmed.length > ANNOTATION_BODY_MAX_LENGTH
				? `주석은 ${ANNOTATION_BODY_MAX_LENGTH}자 이하로 입력해 주세요`
				: undefined;
		setFieldError(error);
		if (!error) onSubmit(trimmed);
	}

	return (
		<form
			noValidate
			className="inline-form"
			onSubmit={submit}
			aria-busy={saving}
			data-testid="annotation-add-form"
		>
			{addState.error && (
				<p
					role="alert"
					className="form-alert"
					data-testid="annotation-add-error"
				>
					{addState.error}
				</p>
			)}
			<p className="field-label">선택한 본문</p>
			<blockquote
				className="annotation-quote"
				data-testid="annotation-add-quote"
			>
				{quote}
			</blockquote>
			<div className="field">
				<label htmlFor={`${id}-body`} className="field-label">
					주석 내용
				</label>
				<textarea
					id={`${id}-body`}
					className="input textarea"
					rows={4}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					aria-invalid={fieldError !== undefined}
					data-testid="annotation-add-body"
				/>
				<p className="field-hint">
					{body.trim().length} / {ANNOTATION_BODY_MAX_LENGTH}자
				</p>
				{fieldError && <p className="field-error">{fieldError}</p>}
			</div>
			<p className="muted">
				주석을 추가하면 지금까지 수정한 챕터 본문도 함께 저장됩니다
			</p>
			<div className="form-actions">
				<button
					type="submit"
					className="btn btn-primary"
					disabled={saving}
					aria-busy={saving}
					data-testid="annotation-add-submit"
				>
					{saving ? "주석과 본문 저장 중…" : "주석 추가하고 본문 저장"}
				</button>
				<button
					type="button"
					className="btn"
					disabled={saving}
					onClick={onCancel}
					data-testid="annotation-add-cancel"
				>
					취소
				</button>
			</div>
		</form>
	);
}

function EditForm({
	annotation,
	novelId,
	chapterId,
	onDone,
	onCancel,
}: {
	annotation: Annotation;
	novelId: string;
	chapterId: string;
	onDone: () => void;
	onCancel: () => void;
}) {
	const id = useId();
	const [body, setBody] = useState(annotation.body);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const trimmed = body.trim();
		if (!trimmed || trimmed.length > ANNOTATION_BODY_MAX_LENGTH) {
			setError(`주석 내용은 1~${ANNOTATION_BODY_MAX_LENGTH}자로 입력해 주세요`);
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await updateAnnotation(novelId, chapterId, annotation.id, trimmed);
			await onDone();
		} catch (e) {
			setError(errorText(e));
			setBusy(false);
		}
	}

	return (
		<form noValidate onSubmit={submit} data-testid="annotation-edit-form">
			<blockquote className="annotation-quote">{annotation.quote}</blockquote>
			<label htmlFor={`${id}-body`} className="field-label">
				주석 내용
			</label>
			<textarea
				id={`${id}-body`}
				className="input textarea"
				rows={4}
				value={body}
				onChange={(e) => setBody(e.target.value)}
				data-testid="annotation-edit-body"
			/>
			{error && (
				<p
					role="alert"
					className="field-error"
					data-testid="annotation-edit-error"
				>
					{error}
				</p>
			)}
			<div className="form-actions">
				<button
					type="submit"
					className="btn btn-primary"
					disabled={busy}
					data-testid="annotation-edit-submit"
				>
					{busy ? "저장 중…" : "저장"}
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={onCancel}
					data-testid="annotation-edit-cancel"
				>
					취소
				</button>
			</div>
		</form>
	);
}
