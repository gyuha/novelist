"use client";

import { CHAPTER_TITLE_MAX_LENGTH } from "@novelist/shared";
import { type FormEvent, useRef, useState } from "react";
import { Field } from "./field";

type TitleFormProps = {
	label: string;
	initialTitle?: string;
	submitLabel: string;
	busyLabel: string;
	/** Resolves with an error message, or null on success. */
	onSubmit: (title: string) => Promise<string | null>;
	onCancel: () => void;
	testId: string;
};

export function TitleForm({
	label,
	initialTitle = "",
	submitLabel,
	busyLabel,
	onSubmit,
	onCancel,
	testId,
}: TitleFormProps) {
	const [title, setTitle] = useState(initialTitle);
	const [fieldError, setFieldError] = useState<string>();
	const [formError, setFormError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const trimmed = title.trim();
		const error = !trimmed
			? `${label}을(를) 입력해 주세요`
			: trimmed.length > CHAPTER_TITLE_MAX_LENGTH
				? `${label}은(는) ${CHAPTER_TITLE_MAX_LENGTH}자 이하로 입력해 주세요`
				: undefined;
		setFieldError(error);
		setFormError(null);
		if (error) {
			inputRef.current?.focus();
			return;
		}
		setBusy(true);
		const failure = await onSubmit(trimmed);
		if (failure) {
			setFormError(failure);
			setBusy(false);
		}
	}

	return (
		<form
			noValidate
			className="inline-form"
			onSubmit={submit}
			aria-busy={busy}
			data-testid={testId}
		>
			{formError && (
				<p role="alert" className="form-alert" data-testid={`${testId}-error`}>
					{formError}
				</p>
			)}
			<Field
				label={label}
				name="title"
				value={title}
				onChange={setTitle}
				error={fieldError}
				inputRef={inputRef}
				testId={`${testId}-title`}
			/>
			<div className="form-actions">
				<button
					type="submit"
					className="btn btn-primary"
					disabled={busy}
					data-testid={`${testId}-submit`}
				>
					{busy ? busyLabel : submitLabel}
				</button>
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={onCancel}
					data-testid={`${testId}-cancel`}
				>
					취소
				</button>
			</div>
		</form>
	);
}
