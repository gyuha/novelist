"use client";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@novelist/shared";
import { type Ref, useId, useState } from "react";

export const PASSWORD_RULE = `${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자로 입력해 주세요. 문자 조합 제한은 없습니다`;

type FieldProps = {
	label: string;
	name: string;
	type?: "email" | "password" | "text";
	autoComplete?: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	hint?: string;
	inputRef?: Ref<HTMLInputElement>;
	testId: string;
};

export function Field({
	label,
	name,
	type = "text",
	autoComplete,
	value,
	onChange,
	error,
	hint,
	inputRef,
	testId,
}: FieldProps) {
	const id = useId();
	const [visible, setVisible] = useState(false);
	const isPassword = type === "password";
	const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
		.filter(Boolean)
		.join(" ");

	return (
		<div className="field">
			<label htmlFor={id} className="field-label">
				{label}
			</label>
			<div className="field-row">
				<input
					id={id}
					ref={inputRef}
					className="input"
					name={name}
					type={isPassword && visible ? "text" : type}
					autoComplete={autoComplete}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy || undefined}
					data-testid={testId}
				/>
				{isPassword && (
					<button
						type="button"
						className="btn"
						aria-pressed={visible}
						onClick={() => setVisible((v) => !v)}
						data-testid={`${testId}-toggle`}
					>
						{visible ? "숨기기" : "보기"}
					</button>
				)}
			</div>
			{hint && (
				<p id={`${id}-hint`} className="field-hint">
					{hint}
				</p>
			)}
			{error && (
				<p
					id={`${id}-error`}
					className="field-error"
					data-testid={`${testId}-error`}
				>
					{error}
				</p>
			)}
		</div>
	);
}
