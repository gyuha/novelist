"use client";

import { adminMemberListResponseSchema } from "@novelist/shared";
import { useState } from "react";
import { ConfirmDialog } from "../../components/dialog";
import { api, errorText, request } from "../../lib/api";
import { useList } from "../../lib/use-list";
import { formatDate } from "./format";

export function PendingTab({ search }: { search: string }) {
	const { state, reload } = useList(async () => {
		const res = await request(api.api.admin.pending.$get());
		return adminMemberListResponseSchema.parse(await res.json()).members;
	});
	const [busyId, setBusyId] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [dialogError, setDialogError] = useState<string | null>(null);

	async function act(
		id: string,
		run: () => Promise<Response>,
		onError: (message: string) => void,
	) {
		setBusyId(id);
		try {
			await request(run());
			await reload();
			return true;
		} catch (error) {
			onError(errorText(error));
			return false;
		} finally {
			setBusyId(null);
		}
	}

	if (state.status === "loading") {
		return (
			<p className="muted" aria-busy="true" data-testid="pending-loading">
				불러오는 중…
			</p>
		);
	}
	if (state.status === "error") {
		return (
			<div>
				<p role="alert" className="form-alert" data-testid="pending-list-error">
					{state.message}
				</p>
				<button
					type="button"
					className="btn"
					onClick={reload}
					data-testid="pending-list-retry"
				>
					다시 시도
				</button>
			</div>
		);
	}

	const rows = state.data.filter((m) =>
		m.email.includes(search.trim().toLowerCase()),
	);

	return (
		<div data-testid="pending-list">
			{actionError && (
				<p
					role="alert"
					className="form-alert"
					data-testid="pending-action-error"
				>
					{actionError}
				</p>
			)}
			{rows.length === 0 ? (
				<p className="muted" data-testid="pending-empty">
					{state.data.length === 0
						? "대기 중인 가입 신청이 없습니다"
						: "검색 결과가 없습니다"}
				</p>
			) : (
				<ul className="rows">
					{rows.map((m) => (
						<li
							key={m.id}
							className="row"
							aria-busy={busyId === m.id}
							data-testid={`pending-row-${m.email}`}
						>
							<span className="row-main">{m.email}</span>
							<span className="row-meta">{formatDate(m.createdAt)}</span>
							<span className="row-actions desktop-only">
								<button
									type="button"
									className="btn btn-primary"
									disabled={busyId !== null}
									onClick={() => {
										setActionError(null);
										act(
											m.id,
											() =>
												api.api.admin.members[":id"].approve.$post({
													param: { id: m.id },
												}),
											setActionError,
										);
									}}
									data-testid={`approve-${m.email}`}
								>
									승인
								</button>
								<button
									type="button"
									className="btn btn-danger-outline"
									disabled={busyId !== null}
									onClick={() => {
										setActionError(null);
										setDialogError(null);
										setRejecting({ id: m.id, email: m.email });
									}}
									data-testid={`reject-${m.email}`}
								>
									거절
								</button>
							</span>
						</li>
					))}
				</ul>
			)}
			<p className="muted mobile-only">
				관리 조작은 데스크톱에서 사용할 수 있습니다
			</p>
			{rejecting && (
				<ConfirmDialog
					title="가입 신청 거절"
					confirmLabel="가입 신청 거절"
					busyLabel="거절 중…"
					danger
					busy={busyId === rejecting.id}
					error={dialogError}
					onCancel={() => setRejecting(null)}
					onConfirm={async () => {
						setDialogError(null);
						const ok = await act(
							rejecting.id,
							() =>
								api.api.admin.members[":id"].reject.$post({
									param: { id: rejecting.id },
								}),
							setDialogError,
						);
						if (ok) setRejecting(null);
					}}
					testId="reject-dialog"
				>
					<p>
						<strong>{rejecting.email}</strong>
					</p>
					<p>
						가입 신청을 거절하면 이 신청은 삭제됩니다. 같은 이메일로 다시 가입을
						신청할 수 있습니다
					</p>
				</ConfirmDialog>
			)}
		</div>
	);
}
