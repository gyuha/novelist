"use client";

import {
	NOVEL_DESCRIPTION_MAX_LENGTH,
	NOVEL_TITLE_MAX_LENGTH,
} from "@novelist/shared";
import { type FormEvent, useId, useRef, useState } from "react";
import { Field } from "./field";

type NovelFormProps = {
	initialTitle?: string;
	initialDescription?: string;
	submitLabel: string;
	busyLabel: string;
	/** Resolves with an error message, or null on success. */
	onSubmit: (title: string, description: string) => Promise<string | null>;
	onCancel: () => void;
	testId: string;
};

/** Title + optional description. Input is kept on validation or save errors. */
export function NovelForm({
	initialTitle = "",
	initialDescription = "",
	submitLabel,
	busyLabel,
	onSubmit,
	onCancel,
	testId,
}: NovelFormProps) {
	const descId = useId();
	const [title, setTitle] = useState(initialTitle);
	const [description, setDescription] = useState(initialDescription);
	const [titleError, setTitleError] = useState<string>();
	const [descError, setDescError] = useState<string>();
	const [formError, setFormError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		const trimmed = title.trim();
		const nextTitle = !trimmed
			? "제목을 입력해 주세요"
			: trimmed.length > NOVEL_TITLE_MAX_LENGTH
				? `제목은 ${NOVEL_TITLE_MAX_LENGTH}자 이하로 입력해 주세요`
				: undefined;
		const nextDesc =
			description.trim().length > NOVEL_DESCRIPTION_MAX_LENGTH
				? `설명은 ${NOVEL_DESCRIPTION_MAX_LENGTH}자 이하로 입력해 주세요`
				: undefined;
		setTitleError(nextTitle);
		setDescError(nextDesc);
		setFormError(null);
		if (nextTitle || nextDesc) {
			(nextTitle ? titleRef : descRef).current?.focus();
			return;
		}
		setBusy(true);
		const error = await onSubmit(trimmed, description.trim());
		if (error) {
			setFormError(error);
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
				label="제목"
				name="title"
				value={title}
				onChange={setTitle}
				error={titleError}
				inputRef={titleRef}
				testId={`${testId}-title`}
			/>
			<div className="field">
				<label htmlFor={descId} className="field-label">
					설명 (선택)
				</label>
				<textarea
					id={descId}
					ref={descRef}
					className="input textarea"
					rows={3}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					aria-invalid={descError ? true : undefined}
					data-testid={`${testId}-description`}
				/>
				<p className="field-hint">
					{description.length} / {NOVEL_DESCRIPTION_MAX_LENGTH}자
				</p>
				{descError && (
					<p
						className="field-error"
						data-testid={`${testId}-description-error`}
					>
						{descError}
					</p>
				)}
			</div>
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
