import { describe, expect, it } from "vitest";
import { segmentText } from "../reading-view";
import type { DictionaryData, WordEntry } from "../dictionaries";

const entry = (highlight: string, phrases: string[] = [], definitions = ["x"]): WordEntry => ({
	highlight,
	definitions: definitions.reduce<WordEntry["definitions"]>((all, d) => {
		all[d] = { deleted: false, timestamp: "2026-01-01 10:00:00", sentence: "" };
		return all;
	}, {}),
	highlighthistory: [],
	firstwordofphrase: phrases,
});

const own: DictionaryData = {
	der: entry("known", ["der hund bellt"]),
	hund: entry("semiknown"),
	"der hund bellt": entry("unknown"),
	"don't": entry("known"),
	nacht: entry("None"),
	katze: entry("known"),
};
const coworkers = {
	dave: {
		bellt: entry("known"),
		laut: entry("known", ["laut und klar"]),
		"laut und klar": entry("known"),
		nacht: entry("known"),
		katze: entry("unknown", ["katze miaut"]),
		"katze miaut": entry("known"),
	},
};

/** The groups as "[underline: word/level …]" and plain text, for easy comparison. */
const show = (text: string) =>
	segmentText(text, own, coworkers)
		.map((g) => {
			const inner = g.segments.map((s) => (s.level ? `${s.text}/${s.level}` : s.text)).join("");
			return g.underline ? `[${g.underline}: ${inner}]` : inner;
		})
		.join("");

describe("segmentText", () => {
	it("marks your words with your level, and keeps the text in between", () => {
		expect(show("Ein Hund, ein Hund!")).toBe("Ein Hund/semiknown, ein Hund/semiknown!");
	});

	it("marks words only coworkers have as coworker", () => {
		expect(show("bellt")).toBe("bellt/coworker");
	});

	it("doesn't mark a word in your dictionary without a level, even if a coworker has it", () => {
		expect(show("Nacht")).toBe("Nacht");
	});

	it("underlines your phrases, with their words still marked", () => {
		expect(show("Oh, der Hund bellt laut.")).toBe("Oh, [unknownunderline: der/known Hund/semiknown bellt/coworker] laut/coworker.");
	});

	it("underlines coworkers' phrases you don't have", () => {
		expect(show("laut und klar")).toBe("[coworkerunderline: laut/coworker und klar]");
	});

	it("underlines a coworker's phrase only while you don't have it yourself", () => {
		// you have "katze" but not "katze miaut": Dave's phrase is underlined in blue
		expect(show("katze miaut")).toBe("[coworkerunderline: katze/known miaut]");
		const withPhrase = { ...own, "katze miaut": entry("known") };
		const groups = segmentText("katze miaut", withPhrase, coworkers);
		expect(groups.some((g) => g.underline === "coworkerunderline")).toBe(false);
	});

	it("treats ’ like '", () => {
		expect(show("Don’t!")).toBe("Don’t/known!");
	});

	it("gives the dictionary key for opening a word", () => {
		const [group] = segmentText("Hund", own, coworkers);
		expect(group.segments[0]).toEqual({ text: "Hund", level: "semiknown", term: "hund" });
	});

	it("leaves text without known words alone", () => {
		expect(segmentText("nichts hier", own, coworkers)).toEqual([{ segments: [{ text: "nichts" }, { text: " " }, { text: "hier" }] }]);
		expect(segmentText("", own, coworkers)).toEqual([]);
	});
});
