"use client";

import { useState } from "react";
import { useAuth, useMe } from "../../lib/auth";

// The shell only renders this for pending users; once /auth/me reports
// "active" it redirects to the home page on its own.
export default function PendingPage() {
	const me = useMe();
	const { refresh } = useAuth();
	const [busy, setBusy] = useState(false);
	const [checkError, setCheckError] = useState(false);
	const [stillPending, setStillPending] = useState(false);

	async function check() {
		setBusy(true);
		setCheckError(false);
		try {
			const fresh = await refresh();
			setStillPending(fresh?.status === "pending");
		} catch {
			setCheckError(true);
		}
		setBusy(false);
	}

	return (
		<div className="auth-card">
			<h1 className="auth-title">가입 승인을 기다리고 있습니다</h1>
			<p>
				신청 이메일: <strong data-testid="pending-email">{me.email}</strong>
			</p>
			<p>관리자가 승인하면 이용할 수 있습니다</p>
			{checkError && (
				<p role="alert" className="form-alert" data-testid="pending-error">
					상태를 확인하지 못했습니다. 다시 시도해 주세요
				</p>
			)}
			{stillPending && !checkError && (
				<p role="status" data-testid="pending-still">
					아직 승인 대기 중입니다
				</p>
			)}
			<button
				type="button"
				className="btn btn-primary btn-block"
				aria-busy={busy}
				disabled={busy}
				onClick={check}
				data-testid="pending-check"
			>
				{busy ? "확인 중…" : "승인 상태 확인"}
			</button>
		</div>
	);
}
