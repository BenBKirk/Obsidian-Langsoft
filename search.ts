// Reverse search: find words by their definitions ("dog" finds "hund").
// No Obsidian dependency, so it can be unit tested.
import type { BookShelf, Definition, DictionaryData } from "dictionaries";
import { parseIntoWords } from "words";

export interface SearchResult {
	/** The word or phrase being defined, e.g. "hund". */
	term: string;
	/** The matching definition, e.g. "dog". */
	definition: string;
	/** Your level for the term, or "coworker" if only coworkers have this definition. */
	highlight: string;
	/** Coworkers this result comes from; empty if it is your own definition. */
	coworkers: string[];
	/** Where the definition was added: the sentence, note and date. */
	details: Definition;
}

interface IndexedDefinition extends SearchResult {
	/** The words of the definition, normalised, for matching. */
	tokens: string[];
}

/** Lower case and composed accents, so "Dog" and "dog", "café" typed either way, match. */
function normalise(text: string): string {
	return text.normalize("NFC").toLowerCase();
}

function tokenise(text: string): string[] {
	return parseIntoWords(normalise(text)).map((word) => word.text.replace(/’/g, "'"));
}

/**
 * An index of definitions by the words in them, built from your dictionary
 * and your coworkers'. Build a new one when the dictionaries change.
 */
export class DefinitionIndex {
	private entries: IndexedDefinition[] = [];
	/** Every word that appears in a definition, sorted, for finding words by their beginning. */
	private sortedTokens: string[] = [];
	/** For each word, the definitions it appears in. */
	private byToken = new Map<string, number[]>();

	constructor(own: DictionaryData, coworkers: BookShelf) {
		const seen = new Map<string, IndexedDefinition>();
		const add = (term: string, definition: string, details: Definition, highlight: string, coworker: string | null) => {
			const key = `${term}\u0000${definition}`;
			const existing = seen.get(key);
			if (existing) {
				// yours wins; the same definition from several coworkers is one result
				if (coworker !== null && existing.coworkers.length > 0 && !existing.coworkers.includes(coworker)) {
					existing.coworkers.push(coworker);
				}
				return;
			}
			const entry: IndexedDefinition = {
				term,
				definition,
				highlight,
				coworkers: coworker === null ? [] : [coworker],
				details,
				tokens: tokenise(definition),
			};
			seen.set(key, entry);
			this.entries.push(entry);
		};

		// your own first, so identical coworker definitions are folded into yours
		for (const [term, entry] of Object.entries(own ?? {})) {
			for (const [definition, details] of Object.entries(entry?.definitions ?? {})) {
				if (!details?.deleted) add(term, definition, details, entry.highlight, null);
			}
		}
		for (const name of Object.keys(coworkers ?? {}).sort((a, b) => a.localeCompare(b))) {
			for (const [term, entry] of Object.entries(coworkers[name] ?? {})) {
				if (!entry || entry.highlight === "None") continue;
				for (const [definition, details] of Object.entries(entry.definitions ?? {})) {
					if (!details?.deleted) add(term, definition, details, "coworker", name);
				}
			}
		}

		for (const [i, entry] of this.entries.entries()) {
			for (const token of new Set(entry.tokens)) {
				const list = this.byToken.get(token);
				if (list) list.push(i);
				else this.byToken.set(token, [i]);
			}
		}
		this.sortedTokens = [...this.byToken.keys()].sort();
	}

	/** Number of definitions in the index. */
	get size(): number {
		return this.entries.length;
	}

	/**
	 * Definitions in which every word of the query is the beginning of a
	 * word: "dog" finds "dog" and "dogs", "big do" finds "big dog". Your own
	 * definitions come first, then whole-word matches, then shorter
	 * definitions.
	 */
	search(query: string, limit = 50): SearchResult[] {
		const queryTokens = tokenise(query);
		if (queryTokens.length === 0) return [];

		// candidates: definitions with a word starting like the longest query word
		const first = [...queryTokens].sort((a, b) => b.length - a.length)[0];
		const candidates = new Set<number>();
		for (const token of this.tokensStartingWith(first)) {
			for (const i of this.byToken.get(token) ?? []) candidates.add(i);
		}

		const matches: { entry: IndexedDefinition; exact: number }[] = [];
		for (const i of candidates) {
			const entry = this.entries[i];
			if (!queryTokens.every((q) => entry.tokens.some((t) => t.startsWith(q)))) continue;
			const exact = queryTokens.filter((q) => entry.tokens.includes(q)).length;
			matches.push({ entry, exact });
		}

		matches.sort(
			(a, b) =>
				Number(a.entry.coworkers.length > 0) - Number(b.entry.coworkers.length > 0) ||
				b.exact - a.exact ||
				a.entry.tokens.length - b.entry.tokens.length ||
				a.entry.term.localeCompare(b.entry.term) ||
				a.entry.definition.localeCompare(b.entry.definition)
		);
		return matches.slice(0, limit).map(({ entry }) => {
			const { tokens, ...result } = entry;
			return { ...result, coworkers: [...result.coworkers] };
		});
	}

	/** Every indexed word that starts with `prefix`, found by binary search in the sorted list. */
	private *tokensStartingWith(prefix: string): Generator<string> {
		let low = 0;
		let high = this.sortedTokens.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (this.sortedTokens[mid] < prefix) low = mid + 1;
			else high = mid;
		}
		for (let i = low; i < this.sortedTokens.length && this.sortedTokens[i].startsWith(prefix); i++) {
			yield this.sortedTokens[i];
		}
	}
}
