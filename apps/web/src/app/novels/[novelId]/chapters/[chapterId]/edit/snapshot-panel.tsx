"use client";

import type { Chapter, SnapshotSummary } from "@novelist/shared";
import { useState } from "react";
import { ConfirmDialog } from "../../../../../../components/dialog";
import { DocView } from "../../../../../../components/doc-view";
import { errorText } from "../../../../../../lib/api";
import { formatDateTime } from "../../../../../../lib/format";
import {
	createSnapshot,
	getSnapshot,
	listSnapshots,
	restoreSnapshot,
} from "../../../../../../lib/novels";
import { useList } from "../../../../../../lib/use-list";

type Props = {
	novelId: string;
	chapterId: string;
	/** Unsaved edits: snapshots capture the saved body, so save or cancel first. */
	unsaved: boolean;
	onRestored: (chapter: Chapter) => void;
	onClose: () => void;
};

export function SnapshotPanel({
	novelId,
	chapterId,
	unsaved,
	onRestored,
	onClose,
}: Props) {
	const { state, reload } = useList(() => listSnapshots(novelId, chapterId));
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [selected, setSelected] = useState<SnapshotSummary | null>(null);
	const [preview, setPreview] = useState<
		| { status: "loading" }
		| { status: "error"; message: string }
		| { status: "ready"; body: Chapter["body"] }
	>({ status: "loading" });
	const [confirming, setConfirming] = useState(false);
	const [restoreBusy, setRestoreBusy] = useState(false);
	const [restoreError, setRestoreError] = useState<string | null>(null);

	async function select(snapshot: SnapshotSummary) {
		setSelected(snapshot);
		setPreview({ status: "loading" });
		try {
			const full = await getSnapshot(novelId, chapterId, snapshot.id);
			setPreview({ status: "ready", body: full.body });
		} catch (error) {
			setPreview({ status: "error", message: errorText(error) });
		}
	}

	async function create() {
		setCreating(true);
		setCreateError(null);
		try {
			await createSnapshot(novelId, chapterId);
			await reload();
		} catch (error) {
			setCreateError(errorText(error));
		} finally {
			setCreating(false);
		}
	}

	async function restore() {
		if (!selected) return;
		setRestoreBusy(true);
		setRestoreError(null);
		try {
			const chapter = await restoreSnapshot(novelId, chapterId, selected.id);
			setConfirming(false);
			setSelected(null);
			onRestored(chapter);
			await reload();
		} catch (error) {
			setRestoreError(errorText(error));
		} finally {
			setRestoreBusy(false);
		}
	}

	return (
		<aside
			className="snapshot-panel"
			aria-label="스냅샷"
			data-testid="snapshot-panel"
		>
			<div className="snapshot-head">
				<h2 className="panel-title">스냅샷</h2>
				<button
					type="button"
					className="btn"
					onClick={onClose}
					data-testid="snapshot-close"
				>
					닫기
				</button>
			</div>
			<p className="muted">
				수동 스냅샷은 개수 제한 없이 보관됩니다. 자동 스냅샷은 챕터당 최신
				20개만 남고, 초과하면 가장 오래된 자동 스냅샷부터 삭제됩니다.
			</p>
			{unsaved && (
				<p className="muted" data-testid="snapshot-unsaved-note">
					저장하지 않은 변경이 있습니다. 스냅샷은 저장된 본문 기준이므로
					저장하거나 변경을 취소한 뒤 사용해 주세요.
				</p>
			)}
			<button
				type="button"
				className="btn btn-primary"
				disabled={unsaved || creating}
				aria-busy={creating}
				onClick={create}
				data-testid="snapshot-create"
			>
				{creating ? "만드는 중…" : "수동 스냅샷 만들기"}
			</button>
			{createError && (
				<p
					role="alert"
					className="form-alert"
					data-testid="snapshot-create-error"
				>
					{createError}
				</p>
			)}

			{state.status === "loading" && (
				<p className="muted" aria-busy="true">
					불러오는 중…
				</p>
			)}
			{state.status === "error" && (
				<div>
					<p
						role="alert"
						className="form-alert"
						data-testid="snapshot-list-error"
					>
						{state.message}
					</p>
					<button type="button" className="btn" onClick={reload}>
						다시 시도
					</button>
				</div>
			)}
			{state.status === "ready" &&
				(state.data.length === 0 ? (
					<p className="muted" data-testid="snapshot-empty">
						아직 스냅샷이 없습니다
					</p>
				) : (
					<ul className="rows snapshot-list" data-testid="snapshot-list">
						{state.data.map((snapshot) => (
							<li key={snapshot.id}>
								<button
									type="button"
									className="snapshot-item"
									aria-pressed={selected?.id === snapshot.id}
									onClick={() => select(snapshot)}
									data-testid={`snapshot-item-${snapshot.kind}`}
								>
									<span className="snapshot-kind" data-testid="snapshot-kind">
										{snapshot.kind === "auto"
											? "복원 전 자동 저장"
											: "수동 저장"}
									</span>
									<span className="row-meta">
										{formatDateTime(snapshot.createdAt)}
									</span>
								</button>
							</li>
						))}
					</ul>
				))}

			{selected && (
				<section className="snapshot-preview" aria-label="스냅샷 미리보기">
					<h3 className="panel-title">
						미리보기 ·{" "}
						{selected.kind === "auto" ? "복원 전 자동 저장" : "수동 저장"}
					</h3>
					{preview.status === "loading" && (
						<p className="muted">불러오는 중…</p>
					)}
					{preview.status === "error" && (
						<p
							role="alert"
							className="form-alert"
							data-testid="snapshot-preview-error"
						>
							{preview.message}
						</p>
					)}
					{preview.status === "ready" && (
						<div className="prose snapshot-body" data-testid="snapshot-preview">
							<DocView doc={preview.body} />
						</div>
					)}
					<button
						type="button"
						className="btn btn-primary"
						disabled={unsaved || preview.status !== "ready"}
						onClick={() => {
							setRestoreError(null);
							setConfirming(true);
						}}
						data-testid="snapshot-restore"
					>
						이 스냅샷으로 복원
					</button>
				</section>
			)}

			{confirming && (
				<ConfirmDialog
					title="스냅샷 복원"
					confirmLabel="복원"
					busyLabel="복원 중…"
					busy={restoreBusy}
					error={restoreError}
					onCancel={() => setConfirming(false)}
					onConfirm={restore}
					testId="restore-dialog"
				>
					<p>현재 본문이 선택한 스냅샷으로 대체됩니다.</p>
					<p>
						복원 직전의 현재 본문은 “복원 전 자동 저장” 스냅샷으로 보관됩니다.
					</p>
				</ConfirmDialog>
			)}
		</aside>
	);
}
