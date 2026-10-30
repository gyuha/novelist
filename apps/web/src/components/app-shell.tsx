"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api, request } from "../lib/api";
import { useAuth } from "../lib/auth";
import { redirectFor, shellKind } from "../lib/route-guard";

/** Editor and reader render their own header and use the full window. */
const BARE_PATH = /^\/novels\/[^/]+\/chapters\/[^/]+\/(edit|read)$/;

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

function useLogout() {
	const router = useRouter();
	const { setMe } = useAuth();
	return async () => {
		try {
			await request(api.api.auth.logout.$post());
		} catch {
			// The session may already be gone; either way this browser is signed out.
		}
		setMe(null);
		router.replace("/login");
	};
}

export function ThemeToggle() {
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

	function toggle() {
		const next: Theme = theme === "dark" ? "light" : "dark";
		setTheme(next);
		document.documentElement.dataset.theme = next;
		localStorage.setItem("theme", next);
	}

	return (
		<button type="button" className="btn" onClick={toggle}>
			{theme === "dark" ? "라이트" : "다크"}
		</button>
	);
}

export function AccountMenu({
	email,
	isAdmin,
}: {
	email: string;
	isAdmin: boolean;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const logout = useLogout();

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
				onClick={() => setOpen((v) => !v)}
				data-testid="account-menu-button"
			>
				계정
			</button>
			{open && (
				<div className="menu" role="menu" data-testid="account-menu">
					<p className="menu-email" data-testid="account-email">
						{email}
					</p>
					<Link
						href="/account/password"
						role="menuitem"
						className="menu-item"
						onClick={() => setOpen(false)}
						data-testid="menu-change-password"
					>
						비밀번호 변경
					</Link>
					{isAdmin && (
						<Link
							href="/admin"
							role="menuitem"
							className="menu-item"
							onClick={() => setOpen(false)}
							data-testid="menu-admin"
						>
							관리자
						</Link>
					)}
					<button
						type="button"
						role="menuitem"
						className="menu-item"
						onClick={logout}
						data-testid="menu-logout"
					>
						로그아웃
					</button>
				</div>
			)}
		</div>
	);
}

function SimpleHeader({
	email,
	logoIsLink,
}: {
	email?: string;
	logoIsLink: boolean;
}) {
	const logout = useLogout();
	return (
		<header className="shell-header">
			{logoIsLink ? (
				<Link href="/" className="brand">
					novelist
				</Link>
			) : (
				<span className="brand">novelist</span>
			)}
			<div className="header-actions">
				{email && (
					<>
						<span className="header-email" data-testid="header-email">
							{email}
						</span>
						<button
							type="button"
							className="btn"
							onClick={logout}
							data-testid="logout-button"
						>
							로그아웃
						</button>
					</>
				)}
				<ThemeToggle />
			</div>
		</header>
	);
}

function FullShell({
	email,
	isAdmin,
	children,
}: {
	email: string;
	isAdmin: boolean;
	children: ReactNode;
}) {
	const drawerRef = useRef<HTMLDialogElement>(null);
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
					<ThemeToggle />
					<AccountMenu email={email} isAdmin={isAdmin} />
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

export function AppShell({ children }: { children: ReactNode }) {
	const { state, refresh } = useAuth();
	const pathname = usePathname();
	const router = useRouter();

	const me = state.status === "ready" ? state.me : null;
	const target = state.status === "ready" ? redirectFor(me, pathname) : null;

	useEffect(() => {
		if (target) router.replace(target);
	}, [target, router]);

	if (state.status === "loading") {
		return (
			<main className="center-page" data-testid="auth-loading">
				<p>불러오는 중…</p>
			</main>
		);
	}

	if (state.status === "error") {
		return (
			<main className="center-page">
				<div className="auth-card">
					<p role="alert" className="form-alert" data-testid="auth-error">
						상태를 확인하지 못했습니다
					</p>
					<button
						type="button"
						className="btn btn-primary"
						onClick={() => refresh().catch(() => {})}
						data-testid="auth-retry"
					>
						다시 시도
					</button>
				</div>
			</main>
		);
	}

	// Never render page content (or fire its requests) while a redirect is pending.
	if (target) return <main className="center-page" aria-busy="true" />;

	const kind = shellKind(me);
	if (kind === "full" && me && BARE_PATH.test(pathname)) {
		return <div className="bare-shell">{children}</div>;
	}
	if (kind === "full" && me) {
		return (
			<FullShell email={me.email} isAdmin={me.role === "admin"}>
				{children}
			</FullShell>
		);
	}

	return (
		<div className="shell-simple">
			<SimpleHeader email={me?.email} logoIsLink={kind !== "restricted"} />
			<main className="center-page">{children}</main>
		</div>
	);
}
