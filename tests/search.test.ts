import { describe, expect, it } from "vitest";
import { DefinitionIndex, TermIndex } from "../search";
import type { Definition, DictionaryData, WordEntry } from "../dictionaries";

const def = (deleted = false, sentence = "ein <u>Hund </u>bellt"): Definition => ({
	deleted,
	timestamp: "2026-01-01 10:00:00",
	file: "note.md",
	sentence,
});

/** Object.fromEntries, which isn't in the ES2018 library this project targets. */
function toRecord<T>(pairs: [string, T][]): Record<string, T> {
	const record: Record<string, T> = {};
	for (const [key, value] of pairs) record[key] = value;
	return record;
}

const entry = (highlight: string, definitions: string[], deleted: string[] = []): WordEntry => ({
	highlight,
	definitions: toRecord([
		...definitions.map((d): [string, Definition] => [d, def()]),
		...deleted.map((d): [string, Definition] => [d, def(true)]),
	]),
	highlighthistory: [{ level: highlight, timestamp: "2026-01-01 10:00:00" }],
	firstwordofphrase: [],
});

const mine: DictionaryData = {
	hund: entry("known", ["dog"]),
	hündin: entry("unknown", ["female dog"]),
	hunde: entry("semiknown", ["dogs"]),
	katze: entry("known", ["cat"], ["dog"]),
	"auf jeden fall": entry("unknown", ["in any case"]),
};

const terms = (index: DefinitionIndex, query: string) => index.search(query).map((r) => `${r.term}=${r.definition}`);

describe("DefinitionIndex.search", () => {
	const index = new DefinitionIndex(mine, {});

	it("finds words by a word in their definition", () => {
		expect(terms(index, "cat")).toEqual(["katze=cat"]);
	});

	it("matches the beginnings of words, whole words first", () => {
		expect(terms(index, "dog")).toEqual(["hund=dog", "hündin=female dog", "hunde=dogs"]);
		expect(terms(index, "do")).toEqual(["hund=dog", "hunde=dogs", "hündin=female dog"]);
	});

	it("does not match inside words", () => {
		expect(terms(index, "og")).toEqual([]);
	});

	it("needs every word of the query", () => {
		expect(terms(index, "fem do")).toEqual(["hündin=female dog"]);
		expect(terms(index, "any ca")).toEqual(["auf jeden fall=in any case"]);
		expect(terms(index, "big dog")).toEqual([]);
	});

	it("ignores case, punctuation and how accents were typed", () => {
		expect(terms(index, "  DOG! ")).toEqual(terms(index, "dog"));
		const accents = new DefinitionIndex({ café: entry("known", ["café latte"]) }, {});
		expect(terms(accents, "café")).toEqual(["café=café latte"]);
	});

	it("leaves out deleted definitions", () => {
		expect(terms(index, "dog")).not.toContain("katze=dog");
	});

	it("returns nothing for an empty query", () => {
		expect(index.search("")).toEqual([]);
		expect(index.search(" ... ")).toEqual([]);
	});

	it("returns the level and where the definition was added", () => {
		const [result] = index.search("cat");
		expect(result).toMatchObject({ highlight: "known", coworkers: [], details: { file: "note.md" } });
	});

	it("limits the number of results", () => {
		const many = toRecord(Array.from({ length: 80 }, (_, i): [string, WordEntry] => [`w${i}`, entry("known", ["thing"])]));
		expect(new DefinitionIndex(many, {}).search("thing")).toHaveLength(50);
		expect(new DefinitionIndex(many, {}).search("thing", 10)).toHaveLength(10);
	});
});

describe("coworkers' definitions", () => {
	const coworkers = {
		dave: { hund: entry("known", ["dog"]), wolf: entry("unknown", ["wolf", "wild dog"]) },
		tabea: { wolf: entry("known", ["wild dog"]), welpe: entry("known", ["puppy"]) },
		jed: { fuchs: entry("None", [], ["dog-like animal"]) },
	};
	const index = new DefinitionIndex(mine, coworkers);

	it("are found too, after your own", () => {
		expect(terms(index, "dog")).toEqual(["hund=dog", "hündin=female dog", "hunde=dogs", "wolf=wild dog"]);
	});

	it("are left out when identical to yours", () => {
		const hund = index.search("dog").filter((r) => r.term === "hund");
		expect(hund).toHaveLength(1);
		expect(hund[0].coworkers).toEqual([]);
	});

	it("are shown once when several coworkers have the same", () => {
		const [wolf] = index.search("wild");
		expect(wolf).toMatchObject({ term: "wolf", definition: "wild dog", highlight: "coworker", coworkers: ["dave", "tabea"] });
	});

	it("leave out words a coworker has no level for", () => {
		expect(terms(index, "anim")).toEqual([]);
	});
});

describe("building the index", () => {
	it("copes with missing fields", () => {
		const odd = { a: { highlight: "known" } as unknown as WordEntry, b: entry("known", ["bee"]) };
		expect(terms(new DefinitionIndex(odd, { x: undefined as unknown as DictionaryData }), "bee")).toEqual(["b=bee"]);
	});

	it("is quick for a large dictionary", () => {
		const big: DictionaryData = {};
		for (let i = 0; i < 20000; i++) big[`wort${i}`] = entry("known", [`meaning ${i} of something`, `other sense ${i}`]);
		const start = performance.now();
		const index = new DefinitionIndex(big, {});
		const built = performance.now();
		index.search("mean");
		index.search("som");
		const searched = performance.now();
		expect(index.size).toBe(40000);
		expect(built - start).toBeLessThan(1500);
		expect(searched - built).toBeLessThan(200);
	});
});

describe("TermIndex.search", () => {
	const words: DictionaryData = {
		hund: entry("known", ["dog"]),
		hunde: entry("semiknown", ["dogs"]),
		hündin: entry("unknown", ["female dog"]),
		"der hund bellt": entry("unknown", ["the dog barks"]),
		"auf jeden fall": entry("known", ["in any case"]),
		katze: entry("known", [], ["cat"]), // only a deleted definition
		bellt: entry("unknown", ["barks"]),
	};
	const coworkers = {
		dave: { wolf: entry("unknown", ["wolf"]), hund: entry("known", ["hound"]), laut: entry("known", ["loud"]) },
		tabea: { wolf: entry("known", ["wild dog"]), welpe: entry("None", [], ["puppy"]) },
	};
	const index = new TermIndex(words, coworkers);
	const found = (query: string) => index.search(query).map((r) => r.term);

	it("finds words by their beginning, the word itself first", () => {
		expect(found("hund")).toEqual(["hund", "hunde", "der hund bellt"]);
		expect(found("hun")).toEqual(["hund", "hunde", "der hund bellt"]);
		expect(found("hün")).toEqual(["hündin"]);
	});

	it("finds phrases by any of their words", () => {
		expect(found("fall")).toEqual(["auf jeden fall"]);
		expect(found("jeden f")).toEqual(["auf jeden fall"]);
	});

	it("leaves out words with no definition left, and coworkers' words they have no level for", () => {
		expect(found("katze")).toEqual([]);
		expect(found("welpe")).toEqual([]);
	});

	it("gives your definitions for your words, and coworkers' (named) for the rest", () => {
		const [hund] = index.search("hund");
		expect(hund).toMatchObject({ highlight: "known", coworkers: [], inQuery: false });
		expect(hund.definitions.map((d) => d.definition)).toEqual(["dog"]);

		const [wolf] = index.search("wolf");
		expect(wolf).toMatchObject({ highlight: "coworker", coworkers: ["dave", "tabea"] });
		expect(wolf.definitions.map((d) => d.definition)).toEqual(["wolf", "wild dog"]);
	});

	it("finds the words and phrases in a sentence, in order, longer phrases first", () => {
		const results = index.search("Der Hund bellt laut!");
		expect(results.filter((r) => r.inQuery).map((r) => r.term)).toEqual(["der hund bellt", "hund", "bellt", "laut"]);
	});

	it("lists a word once even if found both ways", () => {
		const results = index.search("hund bellt");
		expect(results.map((r) => r.term)).toEqual(["der hund bellt", "hund", "bellt"]);
		expect(results[0].inQuery).toBe(false);
		expect(results.slice(1).every((r) => r.inQuery)).toBe(true);
	});

	it("returns nothing for an empty query", () => {
		expect(index.search("")).toEqual([]);
	});
});
