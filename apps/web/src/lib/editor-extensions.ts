import StarterKit from "@tiptap/starter-kit";

/**
 * Only what docSchema allows: doc, paragraph, text, bold, horizontalRule (scene break).
 * Everything else StarterKit ships is switched off so getJSON() stays strict-schema clean
 * and pasted content is normalised to paragraphs and bold.
 */
export const editorExtensions = [
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
