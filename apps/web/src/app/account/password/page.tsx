"use client";

import { changePasswordRequestSchema } from "@novelist/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { Field, PASSWORD_RULE } from "../../../components/field";
import { api, errorCode, errorText, request } from "../../../lib/api";
import { useAuth, useMe } from "../../../lib/auth";
import {
	confirmError,
	newPasswordError,
	requiredError,
} from "../../../lib/forms";
import { HOME_PATH } from "../../../lib/route-guard";

type Errors = { current?: string; next?: string; confirm?: string };

export default function PasswordPage() {
	const me = useMe();
	const forced = me.mustChangePassword;
	const router = useRouter();
	const { refresh } = useAuth();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [errors, setErrors] = useState<Errors>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// Remembers which mode finished: refresh() clears mustChangePassword mid-flow.
	const [done, setDone] = useState<"forced" | "voluntary" | null>(null);
	const currentRef = useRef<HTMLInputElement>(null);
	const nextRef = useRef<HTMLInputElement>(null);
	const confirmRef = useRef<HTMLInputElement>(null);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const found: Errors = {
			current: requiredError(current, "현재 비밀번호"),
			next: newPasswordError(next),
			confirm: confirmError(next, confirm),
		};
		setErrors(found);
		setFormError(null);
		const first = found.current
			? currentRef
			: found.next
				? nextRef
				: found.confirm
					? confirmRef
					: null;
		if (first) {
			first.current?.focus();
			return;
		}

		setBusy(true);
		try {
			const body = changePasswordRequestSchema.parse({
				currentPassword: current,
				newPassword: next,
			});
			await request(api.api.auth.password.$post({ json: body }));
			setCurrent("");
			setNext("");
			setConfirm("");
			setDone(forced ? "forced" : "voluntary");
			// Re-read the account so the shell sees mustChangePassword cleared.
			await refresh();
			if (forced) router.replace(HOME_PATH);
		} catch (error) {
			if (errorCode(error) === "invalid_current_password") {
				setErrors({ current: errorText(error) });
				currentRef.current?.focus();
			} else {
				setFormError(errorText(error));
			}
		}
		setBusy(false);
	}

	if (done) {
		return (
			<div className="auth-card">
				<h1 className="auth-title">비밀번호 변경</h1>
				<p
					role="status"
					className="form-success"
					data-testid="password-success"
				>
					{done === "forced"
						? "비밀번호를 변경했습니다"
						: "비밀번호를 변경했습니다. 다른 기기에서는 로그아웃되었습니다"}
				</p>
				{done === "voluntary" && (
					<button
						type="button"
						className="btn btn-primary btn-block"
						onClick={() => router.push(HOME_PATH)}
						data-testid="password-back"
					>
						돌아가기
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="auth-card">
			<h1 className="auth-title">비밀번호 변경</h1>
			{forced ? (
				<p data-testid="password-forced-notice">
					관리자가 발급한 임시 비밀번호로 로그인했습니다. 계정을 안전하게
					사용하려면 먼저 새 비밀번호를 설정해 주세요. 변경을 완료해야 다른
					기능을 이용할 수 있습니다
				</p>
			) : (
				<p>
					비밀번호를 변경하면 다른 기기에서 로그아웃됩니다. 현재 기기의 로그인은
					유지됩니다
				</p>
			)}
			<form
				noValidate
				onSubmit={onSubmit}
				aria-busy={busy}
				data-testid="password-form"
			>
				{formError && (
					<p role="alert" className="form-alert" data-testid="password-error">
						{formError}
					</p>
				)}
				<Field
					label="현재 비밀번호"
					name="currentPassword"
					type="password"
					autoComplete="current-password"
					value={current}
					onChange={setCurrent}
					error={errors.current}
					inputRef={currentRef}
					testId="password-current"
				/>
				<Field
					label="새 비밀번호"
					name="newPassword"
					type="password"
					autoComplete="new-password"
					value={next}
					onChange={setNext}
					error={errors.next}
					hint={PASSWORD_RULE}
					inputRef={nextRef}
					testId="password-new"
				/>
				<Field
					label="새 비밀번호 확인"
					name="confirmPassword"
					type="password"
					autoComplete="new-password"
					value={confirm}
					onChange={setConfirm}
					error={errors.confirm}
					inputRef={confirmRef}
					testId="password-confirm"
				/>
				<button
					type="submit"
					className="btn btn-primary btn-block"
					disabled={busy}
					data-testid="password-submit"
				>
					{busy ? "변경 중…" : "비밀번호 변경"}
				</button>
				{!forced && (
					<button
						type="button"
						className="btn btn-block"
						onClick={() => router.back()}
						data-testid="password-cancel"
					>
						취소
					</button>
				)}
			</form>
		</div>
	);
}
