import { Mark } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Only what the memo doc schema allows: doc, paragraph, text, bold, horizontalRule (scene break).
 * Everything else StarterKit ships is switched off so getJSON() stays strict-schema clean
 * and pasted content is normalised to paragraphs and bold.
 */
export const memoExtensions = [
	StarterKit.configure({
		blockquote: false,
		bulletList: false,
		code: false,
		codeBlock: false,
		dropcursor: false,
		gapcursor: false,
		hardBreak: false,
		heading: false,
		italic: false,
		link: false,
		listItem: false,
		listKeymap: false,
		orderedList: false,
		strike: false,
		trailingNode: false,
		underline: false,
	}),
];

export const ANNOTATION_MARK = "annotation";

/**
 * Position-tracking annotation mark (docSchema: `{type:"annotation", attrs:{id}}`).
 * It has no parse rule, so pasted or dropped HTML never carries an annotation along:
 * duplicating a mark id would make two ranges claim one annotation row.
 */
const Annotation = Mark.create({
	name: ANNOTATION_MARK,
	inclusive: false,
	addAttributes() {
		return { id: { default: null } };
	},
	parseHTML() {
		return [];
	},
	renderHTML({ mark }) {
		return [
			"span",
			{
				class: "annotation-mark",
				"data-annotation-id": mark.attrs.id,
				"data-testid": "annotation-mark",
			},
			0,
		];
	},
});

/** Chapter body: the memo tools plus the annotation mark. */
export const editorExtensions = [...memoExtensions, Annotation];
