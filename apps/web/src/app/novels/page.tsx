"use client";

import type { Novel } from "@novelist/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/dialog";
import { MoreMenu } from "../../components/more-menu";
import { NovelForm } from "../../components/novel-form";
import { errorText } from "../../lib/api";
import {
	createNovel,
	deleteNovel,
	listChapters,
	listNovels,
	updateNovel,
} from "../../lib/novels";
import { useList } from "../../lib/use-list";
import { formatDate } from "../admin/format";

export default function NovelsPage() {
	const { state, reload } = useList(listNovels);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<Novel | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [counts, setCounts] = useState<Record<string, number>>({});

	// The novel list response carries no chapter count, so read it per novel.
	useEffect(() => {
		if (state.status !== "ready") return;
		let cancelled = false;
		for (const novel of state.data) {
			listChapters(novel.id)
				.then((chapters) => {
					if (!cancelled)
						setCounts((prev) => ({ ...prev, [novel.id]: chapters.length }));
				})
				.catch(() => {});
		}
		return () => {
			cancelled = true;
		};
	}, [state]);

	if (state.status === "loading") {
		return (
			<>
				<h1 className="page-title">내 소설</h1>
				<p className="muted" aria-busy="true" data-testid="novels-loading">
					불러오는 중…
				</p>
			</>
		);
	}
	if (state.status === "error") {
		return (
			<>
				<h1 className="page-title">내 소설</h1>
				<p role="alert" className="form-alert" data-testid="novels-error">
					{state.message}
				</p>
				<button
					type="button"
					className="btn"
					onClick={reload}
					data-testid="novels-retry"
				>
					다시 시도
				</button>
			</>
		);
	}

	const term = search.trim().toLowerCase();
	const rows = state.data.filter((n) => n.title.toLowerCase().includes(term));

	return (
		<>
			<div className="title-row">
				<h1 className="page-title">내 소설</h1>
				<button
					type="button"
					className="btn btn-primary desktop-only"
					disabled={creating}
					onClick={() => setCreating(true)}
					data-testid="new-novel-button"
				>
					새 소설
				</button>
			</div>

			{creating && (
				<div className="desktop-only">
					<NovelForm
						submitLabel="만들기"
						busyLabel="만드는 중…"
						testId="new-novel-form"
						onCancel={() => setCreating(false)}
						onSubmit={async (title, description) => {
							try {
								await createNovel({
									title,
									...(description && { description }),
								});
							} catch (error) {
								return errorText(error);
							}
							setCreating(false);
							await reload();
							return null;
						}}
					/>
				</div>
			)}

			<div className="filters">
				<input
					type="search"
					className="input"
					aria-label="소설 검색"
					placeholder="소설 검색"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					data-testid="novel-search"
				/>
			</div>

			{rows.length === 0 ? (
				state.data.length === 0 ? (
					<p className="muted" data-testid="novels-empty">
						첫 소설을 만들어 보세요
					</p>
				) : (
					<div data-testid="novels-no-match">
						<p className="muted">검색 결과가 없습니다</p>
						<button type="button" className="btn" onClick={() => setSearch("")}>
							검색 초기화
						</button>
					</div>
				)
			) : (
				<ul className="rows" data-testid="novel-list">
					{rows.map((novel) =>
						editingId === novel.id ? (
							<li key={novel.id} className="row">
								<NovelForm
									initialTitle={novel.title}
									initialDescription={novel.description ?? ""}
									submitLabel="저장"
									busyLabel="저장 중…"
									testId="edit-novel-form"
									onCancel={() => setEditingId(null)}
									onSubmit={async (title, description) => {
										try {
											await updateNovel(novel.id, {
												title,
												description: description || null,
											});
										} catch (error) {
											return errorText(error);
										}
										setEditingId(null);
										await reload();
										return null;
									}}
								/>
							</li>
						) : (
							<li
								key={novel.id}
								className="row"
								data-testid={`novel-row-${novel.title}`}
							>
								<div className="row-main">
									<Link
										href={`/novels/${novel.id}`}
										className="novel-link"
										data-testid={`novel-link-${novel.title}`}
									>
										{novel.title}
									</Link>
									{novel.description && (
										<p className="novel-description">{novel.description}</p>
									)}
								</div>
								<span className="row-meta" data-testid="novel-updated">
									{formatDate(novel.updatedAt)}
								</span>
								<span className="row-meta" data-testid="novel-chapter-count">
									{counts[novel.id] === undefined
										? "챕터 –"
										: `챕터 ${counts[novel.id]}개`}
								</span>
								<span className="desktop-only">
									<MoreMenu
										label={`${novel.title} 더보기`}
										testId={`novel-more-${novel.title}`}
										items={[
											{
												label: "소설 수정",
												testId: `novel-edit-${novel.title}`,
												onSelect: () => setEditingId(novel.id),
											},
											{
												label: "삭제",
												danger: true,
												testId: `novel-delete-${novel.title}`,
												onSelect: () => {
													setDeleteError(null);
													setDeleting(novel);
												},
											},
										]}
									/>
								</span>
							</li>
						),
					)}
				</ul>
			)}

			{deleting && (
				<ConfirmDialog
					title="소설 삭제"
					confirmLabel="소설 삭제"
					busyLabel="삭제 중…"
					danger
					busy={deleteBusy}
					error={deleteError}
					onCancel={() => setDeleting(null)}
					onConfirm={async () => {
						setDeleteBusy(true);
						setDeleteError(null);
						try {
							await deleteNovel(deleting.id);
							setDeleting(null);
							await reload();
						} catch (error) {
							setDeleteError(errorText(error));
						} finally {
							setDeleteBusy(false);
						}
					}}
					testId="delete-novel-dialog"
				>
					<p>
						<strong>{deleting.title}</strong>
					</p>
					<p>
						소설을 삭제하면 모든 챕터와 스냅샷이 즉시 영구 삭제되며 되돌릴 수
						없습니다
					</p>
				</ConfirmDialog>
			)}
		</>
	);
}
