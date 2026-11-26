import { describe, expect, it } from "vitest";
import { noteCoverage } from "../coverage";
import type { DictionaryData, WordEntry } from "../dictionaries";

const level = (highlight: string): WordEntry => ({ highlight, definitions: {}, highlighthistory: [], firstwordofphrase: [] });

const dict: DictionaryData = {
	der: level("known"),
	hund: level("known"),
	bellt: level("semiknown"),
	laut: level("unknown"),
	nacht: level("None"),
};

describe("noteCoverage", () => {
	it("counts distinct words by your level, and words nobody has as none", () => {
		expect(noteCoverage("Der Hund bellt laut. Der Hund schläft in der Nacht.", dict)).toEqual({
			words: 7,
			counts: { known: 2, semiknown: 1, unknown: 1, coworker: 0, none: 3 },
		});
	});

	it("is empty for a note without words", () => {
		expect(noteCoverage("", dict)).toEqual({ words: 0, counts: { known: 0, semiknown: 0, unknown: 0, coworker: 0, none: 0 } });
		expect(noteCoverage("123 — 4.5!", dict).words).toBe(0);
	});

	it("leaves out front matter, code and web addresses", () => {
		const text = "---\ntags: [hund]\n---\nDer `code` Hund\n```\nfunction bellt()\n```\nsee https://example.com/hund";
		expect(noteCoverage(text, dict)).toEqual({ words: 3, counts: { known: 2, semiknown: 0, unknown: 0, coworker: 0, none: 1 } });
	});

	it("counts words only coworkers have, like the blue highlighting", () => {
		const coworkers = {
			dave: { schläft: level("known"), nacht: level("known"), in: level("None") },
			tabea: { schläft: level("unknown") },
		};
		// "nacht" is in your dictionary (level None), so it isn't a coworker word, as in the editor;
		// "in" is only in Dave's with level None, so nobody has it
		expect(noteCoverage("Der Hund schläft in der Nacht.", dict, coworkers).counts).toEqual({
			known: 2,
			semiknown: 0,
			unknown: 0,
			coworker: 1,
			none: 2,
		});
	});
});
