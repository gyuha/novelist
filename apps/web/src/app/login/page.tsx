"use client";

import { loginRequestSchema, meResponseSchema } from "@novelist/shared";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { Field } from "../../components/field";
import { api, errorCode, errorText, request } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { emailError, requiredError } from "../../lib/forms";

export default function LoginPage() {
	const { setMe } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errors, setErrors] = useState<{ email?: string; password?: string }>(
		{},
	);
	const [formError, setFormError] = useState<string | null>(null);
	const [suspended, setSuspended] = useState(false);
	const [busy, setBusy] = useState(false);
	const emailRef = useRef<HTMLInputElement>(null);
	const passwordRef = useRef<HTMLInputElement>(null);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const next = {
			email: emailError(email),
			password: requiredError(password, "비밀번호"),
		};
		setErrors(next);
		setFormError(null);
		if (next.email || next.password) {
			(next.email ? emailRef : passwordRef).current?.focus();
			return;
		}

		setBusy(true);
		try {
			const body = loginRequestSchema.parse({ email, password });
			const res = await request(api.api.auth.login.$post({ json: body }));
			// The shell redirects by status once the user is stored.
			setMe(meResponseSchema.parse(await res.json()));
		} catch (error) {
			setSuspended(errorCode(error) === "account_suspended");
			setFormError(errorText(error));
			setBusy(false);
		}
	}

	return (
		<div className="auth-card">
			<h1 className="auth-title">로그인</h1>
			{suspended && (
				<p className="form-alert" data-testid="login-suspended">
					이용이 정지되었습니다. 관리자에게 문의해 주세요
				</p>
			)}
			<form
				noValidate
				onSubmit={onSubmit}
				aria-busy={busy}
				data-testid="login-form"
			>
				{formError && !suspended && (
					<p role="alert" className="form-alert" data-testid="login-error">
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
					testId="login-email"
				/>
				<Field
					label="비밀번호"
					name="password"
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={setPassword}
					error={errors.password}
					inputRef={passwordRef}
					testId="login-password"
				/>
				<button
					type="submit"
					className="btn btn-primary btn-block"
					disabled={busy}
					data-testid="login-submit"
				>
					{busy ? "로그인 중…" : "로그인"}
				</button>
			</form>
			<p className="auth-note">관리자에게 비밀번호 초기화를 요청해 주세요</p>
			<p className="auth-note">
				계정이 없나요?{" "}
				<Link href="/signup" data-testid="to-signup">
					가입 신청
				</Link>
			</p>
		</div>
	);
}
