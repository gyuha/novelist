"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMe } from "../lib/auth";
import { AccountMenu, ThemeToggle } from "./app-shell";

/** Header for the editor: brand, a breadcrumb slot, theme and account. */
export function WorkHeader({ children }: { children: ReactNode }) {
	const me = useMe();
	return (
		<header className="shell-header">
			<Link href="/novels" className="brand">
				novelist
			</Link>
			<nav className="breadcrumb" aria-label="현재 위치">
				{children}
			</nav>
			<div className="header-actions">
				<ThemeToggle />
				<AccountMenu email={me.email} isAdmin={me.role === "admin"} />
			</div>
		</header>
	);
}
