"use client";

import type { Memo } from "@novelist/shared";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "../lib/format";
import { memoListTitle, memoMatches } from "../lib/memo-text";
import {
	getMemo,
	listMemos,
	type MemoFilter,
	type MemoScope,
} from "../lib/memos";
import { listChapters, listNovels } from "../lib/novels";
import { useIsDesktop } from "../lib/use-desktop";
import { useList } from "../lib/use-list";
import { type MemoGuard, useMemoGuard } from "../lib/use-memo-guard";
import { MemoEditor } from "./memo-editor";

type Context = { novelId: string; chapterId: string };

type Props = {
	/**
	 * page: the `/memos` screen (all four scopes with pickers), or one chapter's memos when
	 * `context` is given. panel: the editor side panel (current chapter / novel / free).
	 */
	variant: "page" | "panel";
	context?: Context;
	/** Lets the host (the chapter editor) see unsaved memo text. */
	guardRef?: React.MutableRefObject<MemoGuard | null>;
	initial?: { memoId?: string; creating?: boolean; filter?: MemoFilter };
};

type Open = { key: string; memo: Memo | null };

const SCOPES = [
	{ scope: "all", label: "전체" },
	{ scope: "free", label: "자유" },
	{ scope: "novel", label: "소설" },
	{ scope: "chapter", label: "챕터" },
] as const;

const SCOPE_LABEL = { free: "자유", novel: "소설", chapter: "챕터" } as const;

export function MemoWorkspace({ variant, context, guardRef, initial }: Props) {
	const isDesktop = useIsDesktop();
	const ownGuard = useRef<MemoGuard | null>(null);
	const guardHolder = guardRef ?? ownGuard;
	const { guard, dialog } = useMemoGuard(guardHolder, variant === "page");
	const singleColumn = variant === "panel" || !isDesktop;

	const [filter, setFilter] = useState<MemoFilter>(
		initial?.filter ??
			(context
				? {
						scope: "chapter",
						novelId: context.novelId,
						chapterId: context.chapterId,
					}
				: { scope: "all" }),
	);
	const [search, setSearch] = useState("");
	const [open, setOpen] = useState<Open | null>(null);
	const counter = useRef(0);

	const { state, reload } = useList(() => listMemos(filter));
	const filterKey = `${filter.scope}|${filter.novelId ?? ""}|${filter.chapterId ?? ""}`;
	const firstRun = useRef(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when the filter changes
	useEffect(() => {
		if (firstRun.current) {
			firstRun.current = false;
			return;
		}
		void reload();
	}, [filterKey]);

	const novels = useList(listNovels);
	const chaptersOf = useList(async () =>
		filter.novelId ? listChapters(filter.novelId) : [],
	);
	const reloadChapters = useRef(chaptersOf.reload);
	reloadChapters.current = chaptersOf.reload;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reload the chapter picker with the novel
	useEffect(() => {
		void reloadChapters.current();
	}, [filter.novelId]);

	// A deep link (`?memo=<id>`, `?new=1`) opens straight into the editor.
	const initialMemo = initial?.memoId;
	const initialNew = initial?.creating;
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once for the initial link
	useEffect(() => {
		if (initialMemo) {
			getMemo(initialMemo)
				.then((memo) => setOpen({ key: memo.id, memo }))
				.catch(() => {});
		} else if (initialNew) {
			openNew();
		}
	}, []);

	function defaultScope(): MemoScope {
		if (filter.scope === "chapter" && filter.chapterId)
			return {
				kind: "chapter",
				novelId: filter.novelId,
				chapterId: filter.chapterId,
			};
		if (filter.scope === "novel" && filter.novelId)
			return { kind: "novel", novelId: filter.novelId };
		return { kind: "free" };
	}

	function openNew() {
		counter.current += 1;
		setOpen({ key: `new-${counter.current}`, memo: null });
	}

	function chooseScope(scope: MemoFilter["scope"]) {
		if (variant === "panel" && context) {
			setFilter(
				scope === "chapter"
					? { scope, novelId: context.novelId, chapterId: context.chapterId }
					: scope === "novel"
						? { scope, novelId: context.novelId }
						: { scope },
			);
		} else {
			setFilter({ scope });
		}
	}

	if (state.status === "loading" && !open) {
		return (
			<p className="muted" aria-busy="true" data-testid="memos-loading">
				불러오는 중…
			</p>
		);
	}

	const term = search.trim().toLowerCase();
	const all = state.status === "ready" ? state.data : [];
	const rows = all.filter((m) => memoMatches(m, term));
	const filtered = filter.scope !== "all" || term !== "";
	const lockedToChapter = variant === "page" && context !== undefined;
	const scopeButtons =
		variant === "panel"
			? SCOPES.filter((s) => s.scope !== "all")
			: lockedToChapter
				? []
				: SCOPES;

	const list = (
		<div className="memo-list-pane" data-testid="memo-list-pane">
			<div className="memo-toolbar">
				<button
					type="button"
					className="btn btn-primary"
					onClick={() => guard(openNew)}
					data-testid="memo-new"
				>
					새 메모
				</button>
				<input
					type="search"
					className="input"
					placeholder="메모 검색"
					aria-label="메모 검색"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					data-testid="memo-search"
				/>
			</div>

			{scopeButtons.length > 0 && (
				<fieldset className="choice">
					<legend className="muted">
						{variant === "panel" ? "범위" : "소속 필터"}
					</legend>
					<div className="choice-row">
						{scopeButtons.map((s) => (
							<button
								key={s.scope}
								type="button"
								className="btn"
								aria-pressed={filter.scope === s.scope}
								onClick={() => chooseScope(s.scope)}
								data-testid={`memo-filter-${s.scope}`}
							>
								{variant === "panel" && s.scope === "chapter"
									? "현재 챕터"
									: variant === "panel" && s.scope === "novel"
										? "현재 소설"
										: s.label}
							</button>
						))}
					</div>
				</fieldset>
			)}

			{variant === "page" &&
				!lockedToChapter &&
				(filter.scope === "novel" || filter.scope === "chapter") && (
					<div className="memo-pickers">
						<select
							className="input"
							aria-label="소설 선택"
							value={filter.novelId ?? ""}
							onChange={(e) =>
								setFilter({
									scope: filter.scope,
									novelId: e.target.value || undefined,
								})
							}
							data-testid="memo-filter-novel-select"
						>
							<option value="">모든 소설</option>
							{novels.state.status === "ready" &&
								novels.state.data.map((n) => (
									<option key={n.id} value={n.id}>
										{n.title}
									</option>
								))}
						</select>
						{filter.scope === "chapter" && (
							<select
								className="input"
								aria-label="챕터 선택"
								value={filter.chapterId ?? ""}
								disabled={!filter.novelId}
								onChange={(e) =>
									setFilter({
										scope: "chapter",
										novelId: filter.novelId,
										chapterId: e.target.value || undefined,
									})
								}
								data-testid="memo-filter-chapter-select"
							>
								<option value="">모든 챕터</option>
								{chaptersOf.state.status === "ready" &&
									chaptersOf.state.data.map((c) => (
										<option key={c.id} value={c.id}>
											{c.title}
										</option>
									))}
							</select>
						)}
					</div>
				)}

			{state.status === "error" && (
				<div>
					<p role="alert" className="form-alert" data-testid="memos-error">
						{state.message}
					</p>
					<button
						type="button"
						className="btn"
						onClick={reload}
						data-testid="memos-retry"
					>
						다시 시도
					</button>
				</div>
			)}

			{state.status === "ready" &&
				(all.length === 0 ? (
					<div data-testid="memos-empty">
						<p className="muted">
							{filtered
								? "이 범위에는 아직 메모가 없습니다"
								: "아직 메모가 없습니다. 새 메모로 첫 기록을 남겨 보세요"}
						</p>
						{filter.scope !== "all" &&
							variant === "page" &&
							!lockedToChapter && (
								<button
									type="button"
									className="btn"
									onClick={() => chooseScope("all")}
									data-testid="memo-filter-reset"
								>
									필터 초기화
								</button>
							)}
					</div>
				) : rows.length === 0 ? (
					<div data-testid="memos-no-match">
						<p className="muted">검색 결과가 없습니다</p>
						<button
							type="button"
							className="btn"
							onClick={() => setSearch("")}
							data-testid="memo-search-reset"
						>
							검색 초기화
						</button>
					</div>
				) : (
					<ul className="rows memo-rows" data-testid="memo-list">
						{rows.map((memo) => (
							<li key={memo.id}>
								<button
									type="button"
									className="memo-item"
									aria-pressed={open?.memo?.id === memo.id}
									onClick={() => guard(() => setOpen({ key: memo.id, memo }))}
									data-testid="memo-item"
								>
									<span
										className="memo-item-title"
										data-testid="memo-item-title"
									>
										{memoListTitle(memo)}
									</span>
									<span className="row-meta">
										{SCOPE_LABEL[memo.kind]}
										{memo.aiReference ? " · AI 참고" : ""} ·{" "}
										{formatDateTime(memo.updatedAt)}
									</span>
								</button>
							</li>
						))}
					</ul>
				))}
		</div>
	);

	const editor = open && (
		<div className="memo-edit-pane" data-testid="memo-edit-pane">
			{singleColumn && (
				<button
					type="button"
					className="btn"
					onClick={() => guard(() => setOpen(null))}
					data-testid="memo-back"
				>
					← 메모 목록
				</button>
			)}
			<MemoEditor
				key={open.key}
				memo={open.memo}
				defaultScope={defaultScope()}
				guardRef={guardHolder}
				onSaved={(saved) => {
					// a memo created here keeps its editor; the list picks it up
					setOpen((prev) =>
						prev && prev.key === open.key ? { ...prev, memo: saved } : prev,
					);
					void reload();
				}}
				onDeleted={() => {
					setOpen(null);
					void reload();
				}}
				onCancelNew={() => setOpen(null)}
			/>
		</div>
	);

	const placeholder = !open && !singleColumn && (
		<p className="muted memo-placeholder" data-testid="memo-placeholder">
			메모를 선택하거나 새 메모를 만들어 보세요
		</p>
	);

	return (
		<div
			className="memo-workspace"
			data-layout={singleColumn ? "single" : "split"}
			data-testid="memo-workspace"
		>
			{singleColumn ? (open ? editor : list) : list}
			{!singleColumn && (editor || placeholder)}
			{dialog}
		</div>
	);
}
