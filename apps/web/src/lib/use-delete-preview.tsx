"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./api";

type PreviewState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; memoCount: number };

/** Server-side count of memos a delete would take along; re-read on every dialog open. */
export function useDeletePreview(load: () => Promise<number>) {
	const [state, setState] = useState<PreviewState>({ status: "loading" });
	const loadRef = useRef(load);
	loadRef.current = load;

	const reload = useCallback(async () => {
		setState({ status: "loading" });
		try {
			setState({ status: "ready", memoCount: await loadRef.current() });
		} catch (error) {
			setState({ status: "error", message: errorText(error) });
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	return { state, reload };
}

/** The "메모 N개도 함께 삭제됩니다" block of a delete confirmation. */
export function DeleteMemoNote({
	state,
	reload,
}: {
	state: PreviewState;
	reload: () => void;
}) {
	if (state.status === "loading") {
		return (
			<p
				className="muted"
				aria-busy="true"
				data-testid="delete-preview-loading"
			>
				함께 삭제될 메모 수를 확인하고 있습니다
			</p>
		);
	}
	if (state.status === "error") {
		return (
			<div>
				<p
					role="alert"
					className="form-alert"
					data-testid="delete-preview-error"
				>
					{state.message}
				</p>
				<button
					type="button"
					className="btn"
					onClick={reload}
					data-testid="delete-preview-retry"
				>
					다시 시도
				</button>
			</div>
		);
	}
	return (
		<>
			<p data-testid="delete-memo-count">
				메모 {state.memoCount}개도 함께 삭제됩니다
			</p>
			<p className="muted">연결된 주석도 함께 삭제됩니다</p>
		</>
	);
}
