import { describe, expect, it } from "vitest";
import { findContext } from "../locate";
import { buildSelectionContext } from "../words";

/** The context Langsoft would save for `word` in `line` (cursor at the end of the word). */
const contextFor = (line: string, word: string, occurrence = 0) => {
	let at = -1;
	for (let i = 0; i <= occurrence; i++) at = line.indexOf(word, at + 1);
	return buildSelectionContext(line, at + word.length, word);
};

const found = (note: string, context: string) => {
	const match = findContext(note, context);
	return match && { text: note.slice(match.from, match.to), exact: match.exact };
};

const LINE = "Am Morgen sah ich einen großen Hund im Park, der laut bellte und dann wegrannte.";

describe("findContext", () => {
	it("finds the word in the unchanged sentence", () => {
		const note = `# Notizen\n\nErster Absatz.\n\n${LINE}\n\nNoch ein Hund.`;
		const match = findContext(note, contextFor(LINE, "Hund"));
		expect(match).toMatchObject({ exact: true });
		expect(note.slice(match!.from, match!.to)).toBe("Hund");
		expect(match!.from).toBe(note.indexOf("Hund im Park"));
	});

	it("finds phrases", () => {
		expect(found(LINE, contextFor(LINE, "im Park"))).toEqual({ text: "im Park", exact: true });
	});

	it("ignores punctuation, formatting and line breaks", () => {
		const edited = "Am Morgen sah ich einen **großen** Hund\nim Park - der laut bellte, und dann wegrannte!";
		expect(found(edited, contextFor(LINE, "Hund"))).toEqual({ text: "Hund", exact: true });
	});

	it("ignores case", () => {
		// (not with LINE: upper-casing "großen" gives "GROSSEN", a different word)
		const line = "Am Morgen sah ich einen alten Hund im Park, der laut bellte.";
		expect(found(line.toUpperCase(), contextFor(line, "Hund"))).toEqual({ text: "HUND", exact: true });
	});

	it("finds a word whose sentence changed a little, as not exact", () => {
		const edited = "Am Abend sah ich einen großen Hund im Garten, der laut bellte.";
		expect(found(edited, contextFor(LINE, "Hund"))).toEqual({ text: "Hund", exact: false });
	});

	it("picks the right one of several occurrences", () => {
		const line = "Der Hund schläft. Später sah ich einen großen Hund im Park, der bellte.";
		const match = findContext(line, contextFor(line, "Hund", 1));
		expect(match).toMatchObject({ exact: true, from: line.lastIndexOf("Hund") });
	});

	it("fails when the word is gone", () => {
		expect(findContext("Am Morgen sah ich eine große Katze im Park.", contextFor(LINE, "Hund"))).toBeNull();
	});

	it("fails when too little of the sentence is left", () => {
		expect(findContext("Der Hund schläft.", contextFor(LINE, "Hund"))).toBeNull();
	});

	it("fails when two places are equally good but neither exact", () => {
		const note = "einen großen Hund sehen. einen großen Hund hören.";
		expect(findContext(note, contextFor(LINE, "Hund"))).toBeNull();
	});

	it("trusts an exact match even if the same sentence appears twice", () => {
		expect(found(`${LINE}\n${LINE}`, contextFor(LINE, "Hund"))).toEqual({ text: "Hund", exact: true });
	});

	it("works with little context, needing all of it", () => {
		const context = buildSelectionContext("Hund!", 4, "Hund");
		expect(found("Ein Hund!", context)).toEqual({ text: "Hund", exact: true });
		const two = buildSelectionContext("Ein Hund bellt", 8, "Hund");
		expect(found("Ein Hund bellt laut", two)).toEqual({ text: "Hund", exact: true });
		expect(findContext("Kein Hund schläft", two)).toBeNull();
	});

	it("finds a word with short context after a small edit, if it is the only good place", () => {
		// saved as "U koi manua"; since edited to "au koi manua" (from real data):
		// one of its two saved neighbours is still there, which is enough
		const context = buildSelectionContext("U koi manua", 11, "manua");
		expect(found("ini\nau koi manua\nlagi", context)).toEqual({ text: "manua", exact: false });
		// two places with one matching neighbour each: ambiguous
		expect(findContext("au koi manua. di koi manua.", context)).toBeNull();
		// saved as "o hua haka oi"; since edited to "ohua haka oi": only one of three
		// neighbours is still there, not enough
		expect(findContext("ohua haka oi", buildSelectionContext("o hua haka oi", 10, "haka"))).toBeNull();
	});

	it("copes with missing or odd context", () => {
		expect(findContext(LINE, undefined)).toBeNull();
		expect(findContext(LINE, "no markers")).toBeNull();
		expect(findContext(LINE, "before <u> </u> after")).toBeNull();
		expect(findContext("", contextFor(LINE, "Hund"))).toBeNull();
	});
});
