// What in a note is text to read, and what isn't (links' targets, embedded
// recordings, tags, code…). No Obsidian dependency, so it can be unit tested.

const blank = (match: string) => match.replace(/[^\n]/g, " ");

/** Constructs on one line, in the order they are blanked. Each keeps only the text a reader sees. */
const INLINE: [RegExp, (match: string, ...groups: string[]) => string][] = [
	// %% comments %% (may span lines)
	[/%%[\s\S]*?(?:%%|$)/g, blank],
	// inline code
	[/`[^`\n]*`/g, blank],
	// embeds: ![[recording.m4a]], ![[note]], ![alt](image.png)
	[/!\[\[[^\]\n]*\]\]/g, blank],
	[/!\[[^\]\n]*\]\([^)\n]*\)/g, blank],
	// [[note|shown text]]: keep the shown text; [[note]]: nothing
	[/\[\[([^\]|\n]*)\|([^\]\n]*)\]\]/g, (match, target: string, shown: string) => blank(`[[${target}|`) + shown + "  "],
	[/\[\[[^\]\n]*\]\]/g, blank],
	// [text](address): keep the text
	[/\[([^\]\n]*)\]\(([^)\n]*)\)/g, (match, text: string, address: string) => ` ${text}${blank(`](${address})`)}`],
	// web addresses
	[/\b(?:https?|ftp):\/\/\S+/g, blank],
	[/\bwww\.\S+/g, blank],
	// HTML tags (not what is between them)
	[/<\/?[a-zA-Z][^<>\n]*>/g, blank],
	// #tags, at the start or after a space
	[/(^|\s)(#[\p{L}\p{N}_/-]+)/gu, (match, before: string, tag: string) => before + blank(tag)],
];

/** Constructs only recognised in a whole note: front matter and fenced code. */
const BLOCKS: RegExp[] = [/^---\n[\s\S]*?\n---(?=\n|$)/, /^(```|~~~)[\s\S]*?(?:^\1|(?![\s\S]))/gm];

/**
 * `text` with everything that isn't text to read replaced by spaces, so
 * positions stay the same: embedded recordings and images, links' targets
 * (a link's shown text is kept), web addresses, tags, HTML tags, comments
 * and inline code. With `wholeNote`, also front matter and fenced code
 * blocks, which can only be recognised from the start of a note.
 */
export function maskNonProse(text: string, wholeNote = false): string {
	let result = text;
	if (wholeNote) for (const pattern of BLOCKS) result = result.replace(pattern, blank);
	for (const [pattern, replace] of INLINE) {
		result = result.replace(pattern, replace);
	}
	return result;
}
