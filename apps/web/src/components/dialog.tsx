"use client";

import { type ReactNode, useEffect, useRef } from "react";

type DialogProps = {
	title: string;
	onClose: () => void;
	children: ReactNode;
	testId: string;
};

/** Modal built on <dialog>: focus trap and Esc come from the platform. */
export function Dialog({ title, onClose, children, testId }: DialogProps) {
	const ref = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = ref.current;
		if (dialog && !dialog.open) dialog.showModal();
	}, []);

	return (
		<dialog
			ref={ref}
			className="modal"
			aria-label={title}
			onClose={onClose}
			data-testid={testId}
		>
			<h2 className="modal-title">{title}</h2>
			{children}
		</dialog>
	);
}

type ConfirmDialogProps = {
	title: string;
	children: ReactNode;
	confirmLabel: string;
	busyLabel: string;
	danger?: boolean;
	busy: boolean;
	error: string | null;
	confirmDisabled?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	testId: string;
};

/** Cancel holds the initial focus; failures keep the dialog open. */
export function ConfirmDialog({
	title,
	children,
	confirmLabel,
	busyLabel,
	danger,
	busy,
	error,
	confirmDisabled,
	onConfirm,
	onCancel,
	testId,
}: ConfirmDialogProps) {
	const cancelRef = useRef<HTMLButtonElement>(null);

	// Child effects run first, so Dialog has already called showModal().
	useEffect(() => {
		cancelRef.current?.focus();
	}, []);

	return (
		<Dialog title={title} onClose={onCancel} testId={testId}>
			{children}
			{error && (
				<p role="alert" className="form-alert" data-testid={`${testId}-error`}>
					{error}
				</p>
			)}
			<div className="modal-actions">
				<button
					type="button"
					className="btn"
					ref={cancelRef}
					disabled={busy}
					onClick={onCancel}
					data-testid={`${testId}-cancel`}
				>
					취소
				</button>
				<button
					type="button"
					className={danger ? "btn btn-danger" : "btn btn-primary"}
					disabled={busy || confirmDisabled}
					aria-busy={busy}
					onClick={onConfirm}
					data-testid={`${testId}-confirm`}
				>
					{busy ? busyLabel : confirmLabel}
				</button>
			</div>
		</Dialog>
	);
}
