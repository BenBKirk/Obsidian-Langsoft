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
	it("counts distinct words by your level, and words you have no level for as new", () => {
		expect(noteCoverage("Der Hund bellt laut. Der Hund schläft in der Nacht.", dict)).toEqual({
			words: 7,
			counts: { known: 2, semiknown: 1, unknown: 1, new: 3 },
		});
	});

	it("is empty for a note without words", () => {
		expect(noteCoverage("", dict)).toEqual({ words: 0, counts: { known: 0, semiknown: 0, unknown: 0, new: 0 } });
		expect(noteCoverage("123 — 4.5!", dict).words).toBe(0);
	});

	it("leaves out front matter, code and web addresses", () => {
		const text = "---\ntags: [hund]\n---\nDer `code` Hund\n```\nfunction bellt()\n```\nsee https://example.com/hund";
		expect(noteCoverage(text, dict)).toEqual({ words: 3, counts: { known: 2, semiknown: 0, unknown: 0, new: 1 } });
	});
});
