// Finding where else a word or phrase appears in a note, with the words around it.
// No Obsidian dependency, so it can be unit tested.
import { maskNonProse } from "prose";
import { parseIntoWords, termKey } from "words";

export interface Example {
	/** Offsets of the word or phrase in the note. */
	from: number;
	to: number;
	/** A few words before and after it, from the note, with line breaks as spaces. */
	before: string;
	match: string;
	after: string;
}

/**
 * Every place `term` (a dictionary key: a word or a phrase) appears in a
 * note's text, matched word by word as the highlighting does, so case and
 * ’ or ' don't matter. Links' targets, embedded recordings, tags, code and
 * front matter are left out.
 */
export function findExamples(note: string, term: string, contextWords = 7): Example[] {
	const parts = parseIntoWords(term).map((w) => termKey(w.text));
	if (parts.length === 0) return [];
	// a quick check before splitting the note into words
	if (!termKey(note).includes(parts[0])) return [];

	const text = maskNonProse(note, true);
	const words = parseIntoWords(text);
	const keys = words.map((w) => termKey(w.text));
	const examples: Example[] = [];
	const clean = (s: string) => s.replace(/\s+/g, " ").trim();

	for (let i = 0; i + parts.length <= words.length; i++) {
		if (!parts.every((part, j) => keys[i + j] === part)) continue;
		const first = words[i];
		const last = words[i + parts.length - 1];
		const start = words[Math.max(0, i - contextWords)].from;
		const endWord = words[Math.min(words.length - 1, i + parts.length - 1 + contextWords)];
		examples.push({
			from: first.from,
			to: last.to,
			before: `${i - contextWords > 0 ? "…" : ""}${clean(text.slice(start, first.from))}`,
			match: note.slice(first.from, last.to),
			after: `${clean(text.slice(last.to, endWord.to))}${i + parts.length - 1 + contextWords < words.length - 1 ? "…" : ""}`,
		});
		i += parts.length - 1;
	}
	return examples;
}
