"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { Dialog } from "../components/dialog";
import { errorText } from "./api";

/** What a memo editor exposes so its host can stop navigation from dropping unsaved text. */
export type MemoGuard = { dirty: boolean; save: () => Promise<boolean> };

/**
 * Save / discard / keep-editing gate for leaving an unsaved memo: `guard(action)` runs the action
 * at once when nothing is unsaved, otherwise asks first. Also covers tab close and in-app links.
 */
export function useMemoGuard(
	guardRef: RefObject<MemoGuard | null>,
	/** Off when the host already intercepts tab close and links itself. */
	interceptNavigation = true,
) {
	const router = useRouter();
	const [pending, setPending] = useState<(() => void) | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const guard = useCallback(
		(action: () => void) => {
			if (guardRef.current?.dirty) {
				setError(null);
				setPending(() => action);
			} else {
				action();
			}
		},
		[guardRef],
	);

	useEffect(() => {
		if (!interceptNavigation) return;
		const onUnload = (event: BeforeUnloadEvent) => {
			if (guardRef.current?.dirty) {
				event.preventDefault();
				event.returnValue = "";
			}
		};
		const onClick = (event: MouseEvent) => {
			if (!guardRef.current?.dirty || event.defaultPrevented) return;
			if (event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
				return;
			const anchor = (event.target as Element).closest?.("a[href]");
			if (!anchor || (anchor as HTMLAnchorElement).target === "_blank") return;
			const url = new URL((anchor as HTMLAnchorElement).href);
			if (url.origin !== location.origin) return;
			event.preventDefault();
			event.stopPropagation();
			const href = url.pathname + url.search;
			setError(null);
			setPending(() => () => router.push(href));
		};
		window.addEventListener("beforeunload", onUnload);
		document.addEventListener("click", onClick, true);
		return () => {
			window.removeEventListener("beforeunload", onUnload);
			document.removeEventListener("click", onClick, true);
		};
	}, [guardRef, router, interceptNavigation]);

	const dialog = pending && (
		<Dialog
			title="저장하지 않은 메모가 있습니다"
			onClose={() => setPending(null)}
			testId="memo-leave-dialog"
		>
			<p>이동하기 전에 메모를 저장할지 선택해 주세요.</p>
			{error && (
				<p role="alert" className="form-alert" data-testid="memo-leave-error">
					{error}
				</p>
			)}
			<div className="modal-actions">
				<button
					type="button"
					className="btn"
					disabled={busy}
					onClick={() => setPending(null)}
					data-testid="memo-leave-stay"
				>
					계속 편집
				</button>
				<button
					type="button"
					className="btn btn-danger-outline"
					disabled={busy}
					onClick={() => {
						const action = pending;
						setPending(null);
						// the discarded memo must not re-trigger the guard on the way out
						if (guardRef.current) guardRef.current.dirty = false;
						action();
					}}
					data-testid="memo-leave-discard"
				>
					폐기
				</button>
				<button
					type="button"
					className="btn btn-primary"
					disabled={busy}
					aria-busy={busy}
					onClick={async () => {
						setBusy(true);
						setError(null);
						try {
							if (await guardRef.current?.save()) {
								const action = pending;
								setPending(null);
								action();
							} else {
								setError(
									"저장하지 못했습니다. 메모 화면의 안내를 확인해 주세요",
								);
							}
						} catch (e) {
							setError(errorText(e));
						} finally {
							setBusy(false);
						}
					}}
					data-testid="memo-leave-save"
				>
					{busy ? "저장 중…" : "저장"}
				</button>
			</div>
		</Dialog>
	);

	return { guard, dialog };
}
