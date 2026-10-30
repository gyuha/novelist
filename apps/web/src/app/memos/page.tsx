"use client";

import { useEffect, useState } from "react";
import { MemoWorkspace } from "../../components/memo-workspace";
import type { MemoFilter } from "../../lib/memos";

export default function MemosPage() {
	// `?scope=novel&novelId=` preselects a novel's memos (linked from its chapter list).
	const [initial, setInitial] = useState<{ filter?: MemoFilter } | null>(null);
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const novelId = params.get("novelId") ?? undefined;
		setInitial({
			filter:
				params.get("scope") === "novel" && novelId
					? { scope: "novel", novelId }
					: undefined,
		});
	}, []);
	return (
		<>
			<h1 className="page-title">메모</h1>
			{initial && <MemoWorkspace variant="page" initial={initial} />}
		</>
	);
}
