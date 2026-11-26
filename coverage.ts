// How much of a note's text you know. No Obsidian dependency, so it can be unit tested.
import type { DictionaryData } from "dictionaries";
import { parseIntoWords } from "words";

export type CoverageLevel = "known" | "semiknown" | "unknown" | "new";

export interface Coverage {
	/** Distinct words in the note. */
	words: number;
	/** Distinct words at each level; "new" is words you have no level for. */
	counts: Record<CoverageLevel, number>;
}

/** Text that isn't prose: front matter, code blocks, inline code and web addresses. */
const NOT_PROSE = [/^---\n[\s\S]*?\n---(?:\n|$)/, /```[\s\S]*?(?:```|$)/g, /`[^`\n]*`/g, /\b(?:https?|ftp):\/\/\S+/g];

/**
 * How many of the distinct words in `text` you know, half know, don't know,
 * or have no level for. Words are compared in lower case, as for
 * highlighting; numbers are left out. Phrases aren't counted.
 */
export function noteCoverage(text: string, dict: DictionaryData): Coverage {
	let prose = text;
	for (const pattern of NOT_PROSE) prose = prose.replace(pattern, " ");

	const distinct = new Set<string>();
	for (const word of parseIntoWords(prose)) {
		if (/^[\p{N}'’-]+$/u.test(word.text)) continue;
		distinct.add(word.text.toLowerCase());
	}

	const counts: Record<CoverageLevel, number> = { known: 0, semiknown: 0, unknown: 0, new: 0 };
	for (const word of distinct) {
		const level = dict?.[word]?.highlight;
		if (level === "known" || level === "semiknown" || level === "unknown") counts[level]++;
		else counts.new++;
	}
	return { words: distinct.size, counts };
}
