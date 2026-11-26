// Text helpers with no Obsidian dependency, so they can be unit tested.

/**
 * A word is a run of letters/digits in any script, optionally joined by
 * apostrophes or hyphens: "don't", "well-known", "Straße", "日本語".
 */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;

export interface WordToken {
	text: string;
	from: number;
	to: number;
}

/** Split text into words. `from`/`to` are offsets into `text`, shifted by `offset`. */
export function parseIntoWords(text: string, offset = 0): WordToken[] {
	// a fresh regex each call, because a /g regex keeps state in lastIndex
	const regex = new RegExp(WORD_PATTERN.source, WORD_PATTERN.flags);
	const words: WordToken[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		words.push({
			text: match[0],
			from: match.index + offset,
			to: match.index + offset + match[0].length,
		});
	}
	return words;
}

/** The first word in `text` that contains position `pos` (either end counts), or null. */
export function findWordAt(text: string, pos: number): WordToken | null {
	for (const word of parseIntoWords(text)) {
		if (pos >= word.from && pos <= word.to) {
			return word;
		}
	}
	return null;
}

/**
 * The text around a selection, as stored with each definition: up to
 * `contextWords` words either side (with "..." where it was cut off) and
 * the selection wrapped in <u></u>.
 *
 * `cursorCh` is the cursor position in `line`, which is expected to be at
 * the end of the selection.
 */
export function buildSelectionContext(line: string, cursorCh: number, selection: string, contextWords = 7): string {
	const regex = /\s+/;
	const textBeforeSel = line.slice(0, cursorCh - selection.length);
	const textAfterSel = line.slice(cursorCh, line.length);
	let wordListBefore = textBeforeSel.split(regex);
	let wordListAfter = textAfterSel.split(regex);
	if (wordListBefore.length > contextWords) {
		wordListBefore = wordListBefore.reverse().slice(0, contextWords);
		wordListBefore[contextWords - 1] = "..." + wordListBefore[contextWords - 1];
		wordListBefore = wordListBefore.reverse();
	}
	if (wordListAfter.length > contextWords) {
		wordListAfter = wordListAfter.slice(0, contextWords);
		wordListAfter[contextWords - 1] = wordListAfter[contextWords - 1] + "...";
	}
	const wordsBefore = wordListBefore.join(" ");
	const wordsAfter = wordListAfter.join(" ");
	return `${wordsBefore} <u>${selection} </u>${wordsAfter}`;
}

/**
 * Split a context made by buildSelectionContext back into its parts, so the
 * selection can be shown underlined without treating the text as HTML.
 * Returns null if the context has no <u></u> markers.
 */
export function splitContext(context: string): { before: string; selection: string; after: string } | null {
	const start = context.indexOf("<u>");
	const end = context.lastIndexOf("</u>");
	if (start === -1 || end < start) return null;
	return {
		before: context.slice(0, start),
		selection: context.slice(start + "<u>".length, end),
		after: context.slice(end + "</u>".length),
	};
}
