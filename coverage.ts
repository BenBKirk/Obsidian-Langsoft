// How much of a note's text you know. No Obsidian dependency, so it can be unit tested.
import type { BookShelf, DictionaryData } from "dictionaries";
import { parseIntoWords } from "words";

/**
 * Like the highlighting: your level if the word is in your dictionary;
 * "coworker" if it isn't but a coworker has it with a level; "none" otherwise.
 */
export type CoverageLevel = "known" | "semiknown" | "unknown" | "coworker" | "none";

export interface Coverage {
	/** Distinct words in the note. */
	words: number;
	/** Distinct words at each level. */
	counts: Record<CoverageLevel, number>;
}

/** Text that isn't prose: front matter, code blocks, inline code and web addresses. */
const NOT_PROSE = [/^---\n[\s\S]*?\n---(?:\n|$)/, /```[\s\S]*?(?:```|$)/g, /`[^`\n]*`/g, /\b(?:https?|ftp):\/\/\S+/g];

/**
 * How many of the distinct words in `text` you know, half know or don't
 * know, how many only your coworkers have, and how many nobody has. Words
 * are compared in lower case, as for highlighting; numbers are left out.
 * Phrases aren't counted.
 */
export function noteCoverage(text: string, dict: DictionaryData, coworkers: BookShelf = {}): Coverage {
	let prose = text;
	for (const pattern of NOT_PROSE) prose = prose.replace(pattern, " ");

	const distinct = new Set<string>();
	for (const word of parseIntoWords(prose)) {
		if (/^[\p{N}'’-]+$/u.test(word.text)) continue;
		distinct.add(word.text.toLowerCase());
	}

	const dictionaries = Object.values(coworkers ?? {});
	const counts: Record<CoverageLevel, number> = { known: 0, semiknown: 0, unknown: 0, coworker: 0, none: 0 };
	for (const word of distinct) {
		const own = dict?.[word];
		const level = own?.highlight;
		if (level === "known" || level === "semiknown" || level === "unknown") counts[level]++;
		// as in the editor: blue only for words that aren't in your dictionary at all
		else if (!own && dictionaries.some((d) => d?.[word] && d[word].highlight !== "None")) counts.coworker++;
		else counts.none++;
	}
	return { words: distinct.size, counts };
}
