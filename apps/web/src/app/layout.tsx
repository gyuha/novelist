import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { AuthProvider } from "../lib/auth";
import "../styles/tokens.css";
import "./globals.css";
import "./work.css";

export const metadata: Metadata = {
	title: "novelist",
	description: "AI로 웹소설을 쓰는 작업 공간",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="ko">
			<body>
				<AuthProvider>
					<AppShell>{children}</AppShell>
				</AuthProvider>
			</body>
		</html>
	);
}
