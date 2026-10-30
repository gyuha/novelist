"use client";

import { useEffect, useRef, useState } from "react";

export type MoreMenuItem = {
	label: string;
	onSelect: () => void;
	danger?: boolean;
	testId: string;
};

export function MoreMenu({
	label,
	items,
	testId,
}: {
	label: string;
	items: MoreMenuItem[];
	testId: string;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="menu-root" ref={rootRef}>
			<button
				type="button"
				className="btn"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={label}
				onClick={() => setOpen((v) => !v)}
				data-testid={testId}
			>
				더보기
			</button>
			{open && (
				<div className="menu" role="menu" data-testid={`${testId}-menu`}>
					{items.map((item) => (
						<button
							key={item.testId}
							type="button"
							role="menuitem"
							className={
								item.danger ? "menu-item menu-item-danger" : "menu-item"
							}
							onClick={() => {
								setOpen(false);
								item.onSelect();
							}}
							data-testid={item.testId}
						>
							{item.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
