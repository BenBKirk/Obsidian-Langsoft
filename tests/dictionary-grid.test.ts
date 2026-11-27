import { describe, expect, it } from "vitest";
import { buildRows, filterRows, GridFilter, groupRows, sortRows, viewCounts } from "../dictionary-grid";
import type { DictionaryData, WordEntry } from "../dictionaries";

const entry = (
	highlight: string,
	definitions: Record<string, { at: string; deleted?: boolean; file?: string; sentence?: string }>,
	history: [string, string][] = []
): WordEntry => {
	const defs: WordEntry["definitions"] = {};
	for (const [d, v] of Object.entries(definitions)) {
		defs[d] = { deleted: v.deleted ?? false, timestamp: v.at, file: v.file, sentence: v.sentence ?? "" };
	}
	return {
		highlight,
		definitions: defs,
		highlighthistory: history.map(([level, timestamp]) => ({ level, timestamp })),
		firstwordofphrase: [],
	};
};

// Wednesday 25 November 2026
const NOW = new Date(2026, 10, 25, 12, 0, 0);

const own: DictionaryData = {
	hund: entry("known", { dog: { at: "2026-01-05 10:00:00", file: "Tiere.md", sentence: "ein <u>hund </u>bellt" } }, [
		["unknown", "2026-01-05 10:00:00"],
		["known", "2026-03-01 10:00:00"],
	]),
	katze: entry("unknown", { cat: { at: "2026-11-24 09:00:00", file: "Tiere.md" } }, [["unknown", "2026-11-24 09:00:00"]]),
	"auf jeden fall": entry("semiknown", { "in any case": { at: "2026-06-01 10:00:00" } }, [["semiknown", "2026-06-01 10:00:00"]]),
	weg: entry("None", { gone: { at: "2026-01-01 10:00:00", deleted: true } }),
	vogel: entry("semiknown", { bird: { at: "2026-02-01 10:00:00", sentence: "der <u>vogel </u>singt" }, birdie: { at: "2026-02-03 10:00:00" } }),
};
const coworkers = {
	dave: { hund: entry("known", { hound: { at: "2026-01-01 10:00:00" } }), wolf: entry("unknown", { wolf: { at: "2026-05-01 10:00:00" } }) },
	tabea: { wolf: entry("known", { "wild dog": { at: "2026-04-01 10:00:00" } }), fuchs: entry("None", { fox: { at: "2026-01-01 10:00:00" } }) },
};

const rows = buildRows(own, coworkers);
const byTerm = (term: string) => rows.find((r) => r.term === term)!;
const filter = (changes: Partial<GridFilter> = {}): GridFilter => ({
	view: "all",
	levels: new Set(["unknown", "semiknown", "known"]),
	includeTeam: false,
	query: "",
	scope: "all",
	...changes,
});
const terms = (list: { term: string }[]) => list.map((r) => r.term);

describe("buildRows", () => {
	it("has a row for each of your defined words, and teammates' words you don't have", () => {
		expect(terms(rows).sort()).toEqual(["auf jeden fall", "hund", "katze", "vogel", "wolf"]);
	});

	it("fills in the columns", () => {
		expect(byTerm("hund")).toMatchObject({
			level: "known",
			definitions: ["dog"],
			changes: 2,
			teammates: ["dave"],
			phrase: false,
			added: new Date(2026, 0, 5, 10).getTime(),
			changed: new Date(2026, 2, 1, 10).getTime(),
		});
		expect(byTerm("hund").details).toMatchObject({ file: "Tiere.md", sentence: "ein <u>hund </u>bellt" });
		expect(byTerm("auf jeden fall").phrase).toBe(true);
		expect(byTerm("vogel").definitions).toEqual(["bird", "birdie"]);
	});

	it("gives teammates' words their combined definitions", () => {
		expect(byTerm("wolf")).toMatchObject({ level: "coworker", teammates: ["dave", "tabea"], definitions: ["wolf", "wild dog"] });
	});
});

describe("filterRows", () => {
	it("shows your words by default, and teammates' too when asked", () => {
		expect(terms(filterRows(rows, filter())).sort()).toEqual(["auf jeden fall", "hund", "katze", "vogel"]);
		expect(terms(filterRows(rows, filter({ includeTeam: true })))).toContain("wolf");
	});

	it("filters by level", () => {
		expect(terms(filterRows(rows, filter({ levels: new Set(["known"]) })))).toEqual(["hund"]);
	});

	it("has views", () => {
		expect(terms(filterRows(rows, filter({ view: "week" }), NOW))).toEqual(["katze"]);
		expect(terms(filterRows(rows, filter({ view: "stuck" }), NOW)).sort()).toEqual(["auf jeden fall", "vogel"]);
		expect(terms(filterRows(rows, filter({ view: "phrases" }), NOW))).toEqual(["auf jeden fall"]);
		expect(terms(filterRows(rows, filter({ view: "nosentence" }), NOW)).sort()).toEqual(["auf jeden fall", "katze"]);
		expect(terms(filterRows(rows, filter({ view: "team" }), NOW))).toEqual(["wolf"]);
	});

	it("counts each view", () => {
		expect(viewCounts(rows, NOW)).toMatchObject({ all: 4, unknown: 1, semiknown: 2, known: 1, week: 1, stuck: 2, phrases: 1, team: 1 });
	});

	it("searches everything or one part, all words of the query", () => {
		expect(terms(filterRows(rows, filter({ query: "Dog" })))).toEqual(["hund"]);
		expect(terms(filterRows(rows, filter({ query: "bellt" })))).toEqual(["hund"]);
		expect(terms(filterRows(rows, filter({ query: "bellt", scope: "word" })))).toEqual([]);
		expect(terms(filterRows(rows, filter({ query: "vogel", scope: "sentence" })))).toEqual(["vogel"]);
		expect(terms(filterRows(rows, filter({ query: "any case" })))).toEqual(["auf jeden fall"]);
		// the <u> markers aren't searched
		expect(terms(filterRows(rows, filter({ query: "u>" })))).toEqual([]);
	});
});

describe("sortRows and groupRows", () => {
	const mine = filterRows(rows, filter());

	it("sorts by a column, then by word, either way", () => {
		expect(terms(sortRows(mine, "term"))).toEqual(["auf jeden fall", "hund", "katze", "vogel"]);
		expect(terms(sortRows(mine, "added", true))).toEqual(["katze", "auf jeden fall", "vogel", "hund"]);
		expect(terms(sortRows(mine, "level"))).toEqual(["katze", "auf jeden fall", "vogel", "hund"]);
	});

	it("groups by level, note, month and letter", () => {
		const show = (groups: ReturnType<typeof groupRows>) => groups.map((g) => `${g.label}: ${terms(g.rows).join(",")}`);
		const sorted = sortRows(mine, "term");
		expect(show(groupRows(sorted, "level"))).toEqual(["Unknown: katze", "Semi-known: auf jeden fall,vogel", "Known: hund"]);
		expect(show(groupRows(sorted, "note"))).toEqual(["Tiere: hund,katze", "No note: auf jeden fall,vogel"]);
		expect(show(groupRows(sorted, "month"))).toEqual([
			"November 2026: katze",
			"June 2026: auf jeden fall",
			"February 2026: vogel",
			"January 2026: hund",
		]);
		expect(show(groupRows(sorted, "letter"))).toEqual(["A: auf jeden fall", "H: hund", "K: katze", "V: vogel"]);
		expect(groupRows(sorted, "none")).toEqual([{ key: "", label: "", rows: sorted }]);
	});
});
