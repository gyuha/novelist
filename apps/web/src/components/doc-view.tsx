import type { Doc } from "@novelist/shared";

/**
 * Read-only render of a chapter body; same prose rules as the editor. Annotation marks are
 * invisible unless their id is in `annotationIds` (the reader's "주석 표시").
 */
export function DocView({
	doc,
	annotationIds,
}: {
	doc: Doc;
	annotationIds?: ReadonlySet<string>;
}) {
	return (
		<>
			{(doc.content ?? []).map((node, index) => {
				const key = index;
				if (node.type === "horizontalRule") {
					return <hr key={key} className="scene-break" />;
				}
				return (
					<p key={key}>
						{(node.content ?? []).map((text, i) => {
							let inner = <>{text.text}</>;
							if (text.marks?.some((m) => m.type === "bold"))
								inner = <strong>{text.text}</strong>;
							const mark = text.marks?.find(
								(m) =>
									m.type === "annotation" && annotationIds?.has(m.attrs.id),
							);
							if (mark?.type === "annotation")
								inner = (
									<mark
										className="annotation-mark"
										data-annotation-id={mark.attrs.id}
									>
										{inner}
									</mark>
								);
							// biome-ignore lint/suspicious/noArrayIndexKey: static render of an immutable doc
							return <span key={i}>{inner}</span>;
						})}
						{node.content?.length ? null : <br />}
					</p>
				);
			})}
		</>
	);
}
