"use client";

import { useState } from "react";
import { useMe } from "../../lib/auth";
import { MembersTab } from "./members-tab";
import { PendingTab } from "./pending-tab";

type Tab = "pending" | "members";
type StatusFilter = "all" | "active" | "suspended";

export default function AdminPage() {
	const me = useMe();
	const [tab, setTab] = useState<Tab>("pending");
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<StatusFilter>("all");

	// Non-admins get the notice only; no admin component (or request) is mounted.
	if (me.role !== "admin") {
		return (
			<>
				<h1 className="page-title">접근할 수 없습니다</h1>
				<p data-testid="admin-forbidden">관리자만 이용할 수 있는 화면입니다</p>
			</>
		);
	}

	return (
		<>
			<h1 className="page-title">회원 관리</h1>
			<div role="tablist" className="tabs">
				<button
					type="button"
					role="tab"
					className="tab"
					aria-selected={tab === "pending"}
					onClick={() => setTab("pending")}
					data-testid="tab-pending"
				>
					가입 대기
				</button>
				<button
					type="button"
					role="tab"
					className="tab"
					aria-selected={tab === "members"}
					onClick={() => setTab("members")}
					data-testid="tab-members"
				>
					회원
				</button>
			</div>
			<div className="filters">
				<input
					type="search"
					className="input"
					aria-label="이메일 검색"
					placeholder="이메일 검색"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					data-testid="admin-search"
				/>
				{tab === "members" && (
					<select
						className="input"
						aria-label="상태 필터"
						value={status}
						onChange={(event) => setStatus(event.target.value as StatusFilter)}
						data-testid="admin-status-filter"
					>
						<option value="all">전체</option>
						<option value="active">활성</option>
						<option value="suspended">정지</option>
					</select>
				)}
			</div>
			<div role="tabpanel">
				{tab === "pending" ? (
					<PendingTab search={search} />
				) : (
					<MembersTab search={search} status={status} />
				)}
			</div>
		</>
	);
}
