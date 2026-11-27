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
		for (const token of tokensStartingWith(this.sortedTokens, first)) {
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
			// eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out of the result
			const { tokens, ...result } = entry;
			return { ...result, coworkers: [...result.coworkers] };
		});
	}
}

export interface WordResult {
	/** The word or phrase, e.g. "hund" or "auf jeden fall". */
	term: string;
	/** Your level for it, or "coworker" if only coworkers have it. */
	highlight: string;
	/** Your live definitions, or, if you have none, your coworkers'. */
	definitions: { definition: string; details: Definition }[];
	/** Coworkers the definitions come from; empty if they are yours. */
	coworkers: string[];
	/** True if the word or phrase was found inside the query (a sentence) rather than by its beginning. */
	inQuery: boolean;
}

interface IndexedTerm extends Omit<WordResult, "inQuery"> {
	tokens: string[];
}

/**
 * An index of the words and phrases in your dictionary and your coworkers',
 * for searching in the language being learnt.
 */
export class TermIndex {
	private terms: IndexedTerm[] = [];
	private sortedTokens: string[] = [];
	private byToken = new Map<string, number[]>();
	/** For finding words and phrases inside a sentence: by their first word. */
	private byFirstToken = new Map<string, number[]>();

	constructor(own: DictionaryData, coworkers: BookShelf) {
		const live = (entry: DictionaryData[string] | undefined) =>
			Object.entries(entry?.definitions ?? {})
				.filter(([, details]) => details && !details.deleted)
				.map(([definition, details]) => ({ definition, details }));

		const byTerm = new Map<string, IndexedTerm>();
		for (const [term, entry] of Object.entries(own ?? {})) {
			const definitions = live(entry);
			if (definitions.length === 0) continue;
			byTerm.set(term, { term, highlight: entry.highlight, definitions, coworkers: [], tokens: tokenise(term) });
		}
		for (const name of Object.keys(coworkers ?? {}).sort((a, b) => a.localeCompare(b))) {
			for (const [term, entry] of Object.entries(coworkers[name] ?? {})) {
				if (!entry || entry.highlight === "None") continue;
				const definitions = live(entry);
				if (definitions.length === 0) continue;
				const existing = byTerm.get(term);
				// yours wins; coworkers' definitions are only shown for words you haven't defined
				if (existing && existing.coworkers.length === 0) continue;
				if (existing) {
					existing.coworkers.push(name);
					for (const d of definitions) {
						if (!existing.definitions.some((e) => e.definition === d.definition)) existing.definitions.push(d);
					}
				} else {
					byTerm.set(term, { term, highlight: "coworker", definitions, coworkers: [name], tokens: tokenise(term) });
				}
			}
		}

		this.terms = [...byTerm.values()].filter((t) => t.tokens.length > 0);
		for (const [i, term] of this.terms.entries()) {
			for (const token of new Set(term.tokens)) {
				const list = this.byToken.get(token);
				if (list) list.push(i);
				else this.byToken.set(token, [i]);
			}
			const first = this.byFirstToken.get(term.tokens[0]);
			if (first) first.push(i);
			else this.byFirstToken.set(term.tokens[0], [i]);
		}
		this.sortedTokens = [...this.byToken.keys()].sort();
	}

	get size(): number {
		return this.terms.length;
	}

	/**
	 * Words and phrases for a query in the language being learnt:
	 * - those in which every word of the query begins a word ("hun" finds
	 *   "hund"; "jeden f" finds "auf jeden fall"), the term itself first,
	 *   then those starting with the query, then shorter ones;
	 * - for a query of several words (a sentence), also every word and
	 *   phrase that appears in it, in the order they appear.
	 */
	search(query: string, limit = 50): WordResult[] {
		const queryTokens = tokenise(query);
		if (queryTokens.length === 0) return [];
		const results: WordResult[] = [];
		const seen = new Set<number>();

		const longest = [...queryTokens].sort((a, b) => b.length - a.length)[0];
		const candidates = new Set<number>();
		for (const token of tokensStartingWith(this.sortedTokens, longest)) {
			for (const i of this.byToken.get(token) ?? []) candidates.add(i);
		}
		const rank = (term: IndexedTerm) => {
			if (term.tokens.join(" ") === queryTokens.join(" ")) return 0;
			if (queryTokens.every((q, j) => term.tokens[j]?.startsWith(q))) return 1;
			return 2;
		};
		const matches = [...candidates]
			.filter((i) => queryTokens.every((q) => this.terms[i].tokens.some((t) => t.startsWith(q))))
			.map((i) => ({ i, rank: rank(this.terms[i]) }))
			.sort(
				(a, b) =>
					a.rank - b.rank ||
					Number(this.terms[a.i].coworkers.length > 0) - Number(this.terms[b.i].coworkers.length > 0) ||
					this.terms[a.i].tokens.length - this.terms[b.i].tokens.length ||
					this.terms[a.i].term.localeCompare(this.terms[b.i].term)
			);
		for (const { i } of matches) {
			seen.add(i);
			results.push(this.result(i, false));
		}

		// a sentence: the words and phrases in it, in order
		if (queryTokens.length > 1) {
			for (let start = 0; start < queryTokens.length; start++) {
				const here = (this.byFirstToken.get(queryTokens[start]) ?? [])
					.filter((i) => this.terms[i].tokens.every((t, j) => queryTokens[start + j] === t))
					// longer phrases first
					.sort((a, b) => this.terms[b].tokens.length - this.terms[a].tokens.length);
				for (const i of here) {
					if (seen.has(i)) continue;
					seen.add(i);
					results.push(this.result(i, true));
				}
			}
		}
		return results.slice(0, limit);
	}

	private result(i: number, inQuery: boolean): WordResult {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- left out of the result
		const { tokens, ...term } = this.terms[i];
		return { ...term, coworkers: [...term.coworkers], definitions: [...term.definitions], inQuery };
	}
}

/** Every word in a sorted list that starts with `prefix`, found by binary search. */
function* tokensStartingWith(sorted: string[], prefix: string): Generator<string> {
	let low = 0;
	let high = sorted.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (sorted[mid] < prefix) low = mid + 1;
		else high = mid;
	}
	for (let i = low; i < sorted.length && sorted[i].startsWith(prefix); i++) yield sorted[i];
}
