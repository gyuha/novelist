"use client";

import { meResponseSchema, signupRequestSchema } from "@novelist/shared";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { Field, PASSWORD_RULE } from "../../components/field";
import { api, errorCode, errorText, request } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { confirmError, emailError, newPasswordError } from "../../lib/forms";

type Errors = { email?: string; password?: string; confirm?: string };

export default function SignupPage() {
	const { setMe } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [errors, setErrors] = useState<Errors>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const emailRef = useRef<HTMLInputElement>(null);
	const passwordRef = useRef<HTMLInputElement>(null);
	const confirmRef = useRef<HTMLInputElement>(null);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const next: Errors = {
			email: emailError(email),
			password: newPasswordError(password),
			confirm: confirmError(password, confirm),
		};
		setErrors(next);
		setFormError(null);
		const first = next.email
			? emailRef
			: next.password
				? passwordRef
				: next.confirm
					? confirmRef
					: null;
		if (first) {
			first.current?.focus();
			return;
		}

		setBusy(true);
		try {
			const body = signupRequestSchema.parse({ email, password });
			const res = await request(api.api.auth.signup.$post({ json: body }));
			// Signup logs the applicant in as pending; the shell redirects to /pending.
			setMe(meResponseSchema.parse(await res.json()));
		} catch (error) {
			if (errorCode(error) === "email_taken") {
				setErrors({ email: errorText(error) });
				emailRef.current?.focus();
			} else {
				setFormError(errorText(error));
			}
			setBusy(false);
		}
	}

	return (
		<div className="auth-card">
			<h1 className="auth-title">가입 신청</h1>
			<form
				noValidate
				onSubmit={onSubmit}
				aria-busy={busy}
				data-testid="signup-form"
			>
				{formError && (
					<p role="alert" className="form-alert" data-testid="signup-error">
						{formError}
					</p>
				)}
				<Field
					label="이메일"
					name="email"
					type="email"
					autoComplete="email"
					value={email}
					onChange={setEmail}
					error={errors.email}
					inputRef={emailRef}
					testId="signup-email"
				/>
				<Field
					label="비밀번호"
					name="password"
					type="password"
					autoComplete="new-password"
					value={password}
					onChange={setPassword}
					error={errors.password}
					hint={PASSWORD_RULE}
					inputRef={passwordRef}
					testId="signup-password"
				/>
				<Field
					label="비밀번호 확인"
					name="confirm"
					type="password"
					autoComplete="new-password"
					value={confirm}
					onChange={setConfirm}
					error={errors.confirm}
					inputRef={confirmRef}
					testId="signup-confirm"
				/>
				<button
					type="submit"
					className="btn btn-primary btn-block"
					disabled={busy}
					data-testid="signup-submit"
				>
					{busy ? "가입 신청 중…" : "가입 신청"}
				</button>
			</form>
			<p className="auth-note">가입 후 관리자 승인이 필요합니다</p>
			<p className="auth-note">
				이미 계정이 있나요?{" "}
				<Link href="/login" data-testid="to-login">
					로그인
				</Link>
			</p>
		</div>
	);
}
