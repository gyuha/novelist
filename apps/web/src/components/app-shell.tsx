"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
	{ href: "/novels", label: "소설" },
	{ href: "/memos", label: "메모" },
];

type Theme = "light" | "dark";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = usePathname();
	return (
		<ul className="nav-list">
			{NAV_ITEMS.map((item) => (
				<li key={item.href}>
					<Link
						href={item.href}
						className="nav-link"
						aria-current={pathname.startsWith(item.href) ? "page" : undefined}
						onClick={onNavigate}
					>
						{item.label}
					</Link>
				</li>
			))}
		</ul>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const drawerRef = useRef<HTMLDialogElement>(null);
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		const stored = localStorage.getItem("theme");
		const initial: Theme =
			stored === "light" || stored === "dark"
				? stored
				: window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light";
		setTheme(initial);
		document.documentElement.dataset.theme = initial;
	}, []);

	function toggleTheme() {
		const next: Theme = theme === "dark" ? "light" : "dark";
		setTheme(next);
		document.documentElement.dataset.theme = next;
		localStorage.setItem("theme", next);
	}

	const closeDrawer = () => drawerRef.current?.close();

	return (
		<div className="shell">
			<header className="shell-header">
				<button
					type="button"
					className="btn nav-toggle"
					aria-label="탐색 열기"
					onClick={() => drawerRef.current?.showModal()}
				>
					메뉴
				</button>
				<Link href="/" className="brand">
					novelist
				</Link>
				<nav className="breadcrumb" aria-label="현재 위치">
					<span aria-current="page">홈</span>
				</nav>
				<div className="header-actions">
					<button type="button" className="btn" onClick={toggleTheme}>
						{theme === "dark" ? "라이트" : "다크"}
					</button>
					<button
						type="button"
						className="btn"
						aria-label="계정 메뉴"
						disabled
						title="로그인 기능은 아직 구현되지 않았습니다"
					>
						계정
					</button>
				</div>
			</header>

			<aside className="shell-nav" aria-label="주 탐색">
				<NavList />
			</aside>

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc closes the modal dialog natively */}
			<dialog
				ref={drawerRef}
				className="drawer"
				aria-label="탐색"
				onClick={(event) => {
					if (event.target === drawerRef.current) closeDrawer();
				}}
			>
				<div className="drawer-head">
					<span className="brand">novelist</span>
					<button type="button" className="btn" onClick={closeDrawer}>
						닫기
					</button>
				</div>
				<NavList onNavigate={closeDrawer} />
			</dialog>

			<main className="shell-main">
				<div className="page">{children}</div>
			</main>
		</div>
	);
}
