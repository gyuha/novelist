"use client";

import {
	type AdminMember,
	adminMemberListResponseSchema,
	resetPasswordResponseSchema,
} from "@novelist/shared";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, Dialog } from "../../components/dialog";
import { api, errorText, request } from "../../lib/api";
import { useList } from "../../lib/use-list";
import { formatDate } from "./format";

type Action = { kind: "suspend" | "reset" | "delete"; member: AdminMember };
type StatusFilter = "all" | "active" | "suspended";

const STATUS_LABEL = { active: "활성", suspended: "정지", pending: "대기" };
const ROLE_LABEL = { member: "회원", admin: "관리자" };

function RowMenu({
	member,
	disabled,
	buttonRef,
	onUnsuspend,
	onAction,
}: {
	member: AdminMember;
	disabled: boolean;
	buttonRef: (el: HTMLButtonElement | null) => void;
	onUnsuspend: () => void;
	onAction: (kind: Action["kind"]) => void;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const choose = (fn: () => void) => () => {
		setOpen(false);
		fn();
	};

	return (
		<div className="menu-root" ref={rootRef}>
			<button
				type="button"
				className="btn"
				ref={buttonRef}
				disabled={disabled}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={`${member.email} 관리`}
				onClick={() => setOpen((v) => !v)}
				data-testid={`member-menu-${member.email}`}
			>
				관리
			</button>
			{open && (
				<div className="menu" role="menu">
					{member.status === "suspended" ? (
						<button
							type="button"
							role="menuitem"
							className="menu-item"
							onClick={choose(onUnsuspend)}
							data-testid={`unsuspend-${member.email}`}
						>
							정지 해제
						</button>
					) : (
						<button
							type="button"
							role="menuitem"
							className="menu-item"
							onClick={choose(() => onAction("suspend"))}
							data-testid={`suspend-${member.email}`}
						>
							정지
						</button>
					)}
					<button
						type="button"
						role="menuitem"
						className="menu-item"
						onClick={choose(() => onAction("reset"))}
						data-testid={`reset-${member.email}`}
					>
						비밀번호 초기화
					</button>
					<button
						type="button"
						role="menuitem"
						className="menu-item menu-item-danger"
						onClick={choose(() => onAction("delete"))}
						data-testid={`delete-${member.email}`}
					>
						회원 삭제
					</button>
				</div>
			)}
		</div>
	);
}

export function MembersTab({
	search,
	status,
}: {
	search: string;
	status: StatusFilter;
}) {
	const { state, reload } = useList(async () => {
		const res = await request(api.api.admin.members.$get());
		return adminMemberListResponseSchema.parse(await res.json()).members;
	});
	const [busyId, setBusyId] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [action, setAction] = useState<Action | null>(null);
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [retype, setRetype] = useState("");
	// Held in memory only; cleared on close, never re-fetched.
	const [reset, setReset] = useState<{
		email: string;
		id: string;
		temporaryPassword: string;
	} | null>(null);
	const [copyState, setCopyState] = useState<"idle" | "ok" | "failed">("idle");
	const menuButtons = useRef(new Map<string, HTMLButtonElement | null>());

	async function run(id: string, call: () => Promise<Response>) {
		setBusyId(id);
		try {
			const res = await request(call());
			await reload();
			return res;
		} finally {
			setBusyId(null);
		}
	}

	async function unsuspend(m: AdminMember) {
		setActionError(null);
		try {
			await run(m.id, () =>
				api.api.admin.members[":id"].unsuspend.$post({ param: { id: m.id } }),
			);
		} catch (error) {
			setActionError(errorText(error));
		}
	}

	async function confirm() {
		if (!action) return;
		const { kind, member } = action;
		setDialogError(null);
		try {
			if (kind === "suspend") {
				await run(member.id, () =>
					api.api.admin.members[":id"].suspend.$post({
						param: { id: member.id },
					}),
				);
			} else if (kind === "delete") {
				await run(member.id, () =>
					api.api.admin.members[":id"].$delete({ param: { id: member.id } }),
				);
			} else {
				const res = await run(member.id, () =>
					api.api.admin.members[":id"]["reset-password"].$post({
						param: { id: member.id },
					}),
				);
				const body = resetPasswordResponseSchema.parse(await res.json());
				setCopyState("idle");
				setReset({
					email: member.email,
					id: member.id,
					temporaryPassword: body.temporaryPassword,
				});
			}
			setAction(null);
		} catch (error) {
			setDialogError(errorText(error));
		}
	}

	function closeReset() {
		const id = reset?.id;
		setReset(null);
		if (id) setTimeout(() => menuButtons.current.get(id)?.focus(), 0);
	}

	async function copy() {
		if (!reset) return;
		try {
			await navigator.clipboard.writeText(reset.temporaryPassword);
			setCopyState("ok");
		} catch {
			setCopyState("failed");
		}
	}

	if (state.status === "loading") {
		return (
			<p className="muted" aria-busy="true" data-testid="members-loading">
				불러오는 중…
			</p>
		);
	}
	if (state.status === "error") {
		return (
			<div>
				<p role="alert" className="form-alert" data-testid="members-error">
					{state.message}
				</p>
				<button
					type="button"
					className="btn"
					onClick={reload}
					data-testid="members-retry"
				>
					다시 시도
				</button>
			</div>
		);
	}

	const needle = search.trim().toLowerCase();
	const rows = state.data.filter(
		(m) =>
			m.email.includes(needle) && (status === "all" || m.status === status),
	);

	return (
		<div data-testid="members-list">
			{actionError && (
				<p
					role="alert"
					className="form-alert"
					data-testid="members-action-error"
				>
					{actionError}
				</p>
			)}
			{rows.length === 0 ? (
				<p className="muted" data-testid="members-empty">
					조건에 맞는 회원이 없습니다
				</p>
			) : (
				<ul className="rows">
					{rows.map((m) => (
						<li
							key={m.id}
							className="row"
							aria-busy={busyId === m.id}
							data-testid={`member-row-${m.email}`}
						>
							<span className="row-main">{m.email}</span>
							<span className="row-meta" data-testid={`member-role-${m.email}`}>
								{ROLE_LABEL[m.role]}
							</span>
							<span
								className="row-meta"
								data-testid={`member-status-${m.email}`}
							>
								{STATUS_LABEL[m.status]}
							</span>
							<span className="row-meta">{formatDate(m.createdAt)}</span>
							{/* Admin rows get no action menu at all. */}
							{m.role === "member" && (
								<span className="row-actions desktop-only">
									<RowMenu
										member={m}
										disabled={busyId !== null}
										buttonRef={(el) => {
											menuButtons.current.set(m.id, el);
										}}
										onUnsuspend={() => unsuspend(m)}
										onAction={(kind) => {
											setDialogError(null);
											setRetype("");
											setAction({ kind, member: m });
										}}
									/>
								</span>
							)}
						</li>
					))}
				</ul>
			)}
			<p className="muted mobile-only">
				관리 조작은 데스크톱에서 사용할 수 있습니다
			</p>

			{action?.kind === "suspend" && (
				<ConfirmDialog
					title="회원 정지"
					confirmLabel="회원 정지"
					busyLabel="정지 중…"
					danger
					busy={busyId === action.member.id}
					error={dialogError}
					onCancel={() => setAction(null)}
					onConfirm={confirm}
					testId="suspend-dialog"
				>
					<p>
						<strong>{action.member.email}</strong>
					</p>
					<p>
						정지하면 이 회원은 모든 기기에서 로그아웃되고 정지가 해제될 때까지
						로그인할 수 없습니다. 데이터는 삭제되지 않습니다
					</p>
				</ConfirmDialog>
			)}
			{action?.kind === "reset" && (
				<ConfirmDialog
					title="비밀번호 초기화"
					confirmLabel="비밀번호 초기화"
					busyLabel="초기화 중…"
					busy={busyId === action.member.id}
					error={dialogError}
					onCancel={() => setAction(null)}
					onConfirm={confirm}
					testId="reset-dialog"
				>
					<p>
						<strong>{action.member.email}</strong>
					</p>
					<p>
						이 회원은 모든 기기에서 로그아웃됩니다. 새로 발급되는 임시
						비밀번호를 회원에게 전달해 주세요
					</p>
				</ConfirmDialog>
			)}
			{action?.kind === "delete" && (
				<ConfirmDialog
					title="회원 영구 삭제"
					confirmLabel="회원 영구 삭제"
					busyLabel="삭제 중…"
					danger
					busy={busyId === action.member.id}
					error={dialogError}
					confirmDisabled={retype !== action.member.email}
					onCancel={() => setAction(null)}
					onConfirm={confirm}
					testId="delete-dialog"
				>
					<p>
						<strong>{action.member.email}</strong>
					</p>
					<p>소설·챕터·메모·삽화 파일이 즉시 영구 삭제됩니다</p>
					<label className="field-label" htmlFor="delete-retype">
						확인을 위해 이메일을 다시 입력해 주세요
					</label>
					<input
						id="delete-retype"
						className="input"
						value={retype}
						onChange={(event) => setRetype(event.target.value)}
						autoComplete="off"
						data-testid="delete-dialog-retype"
					/>
				</ConfirmDialog>
			)}

			{reset && (
				<Dialog
					title="임시 비밀번호 발급 완료"
					onClose={closeReset}
					testId="reset-result"
				>
					<p>
						<strong data-testid="reset-result-email">{reset.email}</strong>
					</p>
					<p>
						<code className="temp-password" data-testid="reset-temp-password">
							{reset.temporaryPassword}
						</code>
					</p>
					<div className="modal-actions">
						<button
							type="button"
							className="btn"
							onClick={copy}
							data-testid="reset-copy"
						>
							복사
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={closeReset}
							data-testid="reset-close"
						>
							닫기
						</button>
					</div>
					<p role="status" data-testid="reset-copy-status">
						{copyState === "ok" && "복사했습니다"}
						{copyState === "failed" &&
							"복사하지 못했습니다. 값을 직접 선택해 복사해 주세요"}
					</p>
					<p className="muted">
						이 임시 비밀번호는 지금 한 번만 표시됩니다. 회원은 다음 로그인 때
						반드시 새 비밀번호를 설정해야 합니다
					</p>
				</Dialog>
			)}
		</div>
	);
}
