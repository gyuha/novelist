import type { Doc } from "@novelist/shared";

/** Read-only render of a chapter body; same prose rules as the editor. */
export function DocView({ doc }: { doc: Doc }) {
	return (
		<>
			{(doc.content ?? []).map((node, index) => {
				const key = index;
				if (node.type === "horizontalRule") {
					return <hr key={key} className="scene-break" />;
				}
				return (
					<p key={key}>
						{(node.content ?? []).map((text, i) =>
							text.marks?.some((m) => m.type === "bold") ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: static render of an immutable doc
								<strong key={i}>{text.text}</strong>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: static render of an immutable doc
								<span key={i}>{text.text}</span>
							),
						)}
						{node.content?.length ? null : <br />}
					</p>
				);
			})}
		</>
	);
}
