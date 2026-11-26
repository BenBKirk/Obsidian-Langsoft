// Finding where in a note a definition was added, from the text saved with it.
// No Obsidian dependency, so it can be unit tested.
import { parseIntoWords, splitContext } from "words";

export interface ContextMatch {
	/** Offsets of the defined word or phrase in the note. */
	from: number;
	to: number;
	/** True if all the saved surrounding words are still there; false if only enough of them are. */
	exact: boolean;
}

/**
 * For a match that isn't exact: how many of the saved words next to the
 * defined word must still be there. At most 3, but no more than half of
 * them (rounded up), so short contexts can still match after a small edit;
 * always at least one.
 */
function requiredContextWords(saved: number): number {
	return Math.max(1, Math.min(3, Math.ceil(saved / 2)));
}

/** Words compared ignoring case, punctuation and formatting. */
function words(text: string) {
	return parseIntoWords(text.normalize("NFC")).map((w) => ({ ...w, text: w.text.toLowerCase().replace(/’/g, "'") }));
}

/**
 * Find the place in `note` that a definition's saved context (as made by
 * buildSelectionContext: a few words either side, the selection in
 * <u></u>) came from. Matches word by word, so punctuation, formatting and
 * line breaks don't matter.
 *
 * Returns an exact match if the defined word and all its saved neighbours
 * are there. Otherwise the one place where the word is next to the most of
 * them, if that is enough of them (see requiredContextWords). Returns null
 * if there is no such place, or more than one equally good one.
 */
export function findContext(note: string, context: string | undefined): ContextMatch | null {
	const parts = splitContext(String(context ?? ""));
	if (!parts) return null;
	const before = words(parts.before);
	const selection = words(parts.selection);
	const after = words(parts.after);
	if (selection.length === 0) return null;
	// quick check before splitting the whole note into words, which matters when searching every note
	const flat = note.normalize("NFC").toLowerCase().replace(/’/g, "'");
	if (!selection.every((word) => flat.includes(word.text))) return null;

	const text = words(note);
	const candidates: { index: number; score: number }[] = [];
	for (let i = 0; i + selection.length <= text.length; i++) {
		if (!selection.every((word, j) => text[i + j].text === word.text)) continue;

		// how many saved words match, going outwards from the selection
		let left = 0;
		while (left < before.length && i - 1 - left >= 0 && text[i - 1 - left].text === before[before.length - 1 - left].text) left++;
		let right = 0;
		const end = i + selection.length;
		while (right < after.length && end + right < text.length && text[end + right].text === after[right].text) right++;
		candidates.push({ index: i, score: left + right });
	}
	if (candidates.length === 0) return null;

	const saved = before.length + after.length;
	const best = Math.max(...candidates.map((c) => c.score));
	const exactPossible = best === saved;
	if (!exactPossible && best < requiredContextWords(saved)) return null;
	const winners = candidates.filter((c) => c.score === best);
	const exact = best === saved;
	// two equally good places: only trust the first if it is a perfect match
	if (winners.length > 1 && !exact) return null;

	const { index } = winners[0];
	return { from: text[index].from, to: text[index + selection.length - 1].to, exact };
}
