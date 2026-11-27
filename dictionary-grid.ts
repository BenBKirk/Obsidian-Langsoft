// The rows of the dictionary grid, and filtering, sorting and grouping them.
// No Obsidian dependency, so it can be unit tested.
import type { BookShelf, Definition, DictionaryData, WordEntry } from "dictionaries";
import { periodStart } from "progress";
import { parseTimestamp } from "time";

/** Your level, or "coworker" for a word only teammates have defined. */
export type GridLevel = "unknown" | "semiknown" | "known" | "coworker";
const OWN_LEVELS = new Set(["unknown", "semiknown", "known"]);

export interface GridRow {
	term: string;
	level: GridLevel;
	/** Live definitions: yours, or for a coworker word, your teammates' (each once). */
	definitions: string[];
	/** Where the first definition was added: its saved sentence ("… <u>word</u> …"), note and date. */
	details: Definition;
	/** When the word was first defined, and last changed (definition or level), in milliseconds; null if unknown. */
	added: number | null;
	changed: number | null;
	/** Level changes in the word's history. */
	changes: number;
	/** Teammates who have the word with a level. */
	teammates: string[];
	phrase: boolean;
	/** Lower-cased text for searching. */
	search: { word: string; definition: string; sentence: string };
}

function live(entry: WordEntry | undefined): [string, Definition][] {
	return Object.entries(entry?.definitions ?? {}).filter(([, d]) => d && !d.deleted);
}

function time(text: string | undefined): number | null {
	return parseTimestamp(text)?.getTime() ?? null;
}

const lower = (text: string) => text.normalize("NFC").toLowerCase().replace(/’/g, "'");
const stripMarks = (sentence: string) => sentence.replace(/<\/?u>/g, "");

function makeRow(term: string, level: GridLevel, defs: [string, Definition][], history: WordEntry["highlighthistory"], teammates: string[]): GridRow {
	const defTimes = defs.map(([, d]) => time(d.timestamp)).filter((t): t is number => t !== null);
	const historyTimes = (history ?? []).map((h) => time(h?.timestamp)).filter((t): t is number => t !== null);
	const first = [...defs].sort(([, a], [, b]) => (time(a.timestamp) ?? Infinity) - (time(b.timestamp) ?? Infinity))[0][1];
	const definitions = [...new Set(defs.map(([definition]) => definition))];
	const sentence = String(first.sentence ?? "");
	return {
		term,
		level,
		definitions,
		details: first,
		added: defTimes.length ? Math.min(...defTimes) : null,
		changed: defTimes.length || historyTimes.length ? Math.max(...defTimes, ...historyTimes) : null,
		changes: (history ?? []).filter((h) => OWN_LEVELS.has(h?.level)).length,
		teammates,
		phrase: /\s/.test(term.trim()),
		search: { word: lower(term), definition: lower(definitions.join(" ")), sentence: lower(stripMarks(sentence)) },
	};
}

/**
 * A row for every word or phrase you have defined, and one for every word
 * only your teammates have (defined, with a level), as "coworker".
 */
export function buildRows(own: DictionaryData, coworkers: BookShelf): GridRow[] {
	const names = Object.keys(coworkers ?? {}).sort((a, b) => a.localeCompare(b));
	const teammatesOf = (term: string) =>
		names.filter((name) => {
			const entry = coworkers[name]?.[term];
			return entry && entry.highlight !== "None" && live(entry).length > 0;
		});

	const rows: GridRow[] = [];
	const mine = new Set<string>();
	for (const [term, entry] of Object.entries(own ?? {})) {
		const defs = live(entry);
		if (!entry || defs.length === 0 || !OWN_LEVELS.has(entry.highlight)) continue;
		mine.add(term);
		rows.push(makeRow(term, entry.highlight as GridLevel, defs, entry.highlighthistory, teammatesOf(term)));
	}

	const theirs = new Set<string>();
	for (const name of names) for (const term of Object.keys(coworkers[name] ?? {})) if (!mine.has(term)) theirs.add(term);
	for (const term of theirs) {
		const teammates = teammatesOf(term);
		if (teammates.length === 0) continue;
		const defs = ([] as [string, Definition][]).concat(...teammates.map((name) => live(coworkers[name][term])));
		rows.push(makeRow(term, "coworker", defs, [], teammates));
	}
	return rows;
}

// --- views ----------------------------------------------------------------------

export interface GridView {
	id: string;
	name: string;
	section: "mine" | "team";
	/** Whether a row belongs in the view. */
	test: (row: GridRow, now: Date) => boolean;
}

const DAY = 24 * 3600 * 1000;
const own = (row: GridRow) => row.level !== "coworker";

export const VIEWS: GridView[] = [
	{ id: "all", name: "All words", section: "mine", test: () => true },
	{ id: "unknown", name: "To learn (unknown)", section: "mine", test: (r) => r.level === "unknown" },
	{ id: "semiknown", name: "Almost there (semi)", section: "mine", test: (r) => r.level === "semiknown" },
	{ id: "known", name: "Known", section: "mine", test: (r) => r.level === "known" },
	{
		id: "week",
		name: "Added this week",
		section: "mine",
		test: (r, now) => own(r) && r.added !== null && r.added >= periodStart(now, "week").getTime(),
	},
	{
		id: "stuck",
		name: "Stuck for 2+ months",
		section: "mine",
		test: (r, now) =>
			(r.level === "unknown" || r.level === "semiknown") && r.changed !== null && r.changed < now.getTime() - 60 * DAY,
	},
	{ id: "phrases", name: "Phrases", section: "mine", test: (r) => own(r) && r.phrase },
	{ id: "nosentence", name: "Without a sentence", section: "mine", test: (r) => own(r) && !stripMarks(String(r.details.sentence ?? "")).trim() },
	{ id: "team", name: "Teammates have, I don't", section: "team", test: (r) => r.level === "coworker" },
];

export function findView(id: string | undefined): GridView {
	return VIEWS.find((v) => v.id === id) ?? VIEWS[0];
}

/** How many rows each view has, before the level chips and search. */
export function viewCounts(rows: GridRow[], now = new Date()): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const view of VIEWS) {
		counts[view.id] = rows.filter((r) => view.test(r, now) && (own(r) || view.id === "team")).length;
	}
	return counts;
}

// --- filtering, sorting, grouping ---------------------------------------------------

export type SearchScope = "all" | "word" | "definition" | "sentence";

export interface GridFilter {
	view: string;
	/** Your levels to show. */
	levels: Set<string>;
	/** Show teammates' words you don't have too (always shown in the "team" view). */
	includeTeam: boolean;
	query: string;
	scope: SearchScope;
}

export function filterRows(rows: GridRow[], filter: GridFilter, now = new Date()): GridRow[] {
	const view = findView(filter.view);
	const words = lower(filter.query).split(/\s+/).filter(Boolean);
	return rows.filter((row) => {
		if (!view.test(row, now)) return false;
		if (row.level === "coworker") {
			if (view.id !== "team" && !filter.includeTeam) return false;
		} else if (!filter.levels.has(row.level)) {
			return false;
		}
		if (words.length === 0) return true;
		const text =
			filter.scope === "all" ? `${row.search.word} ${row.search.definition} ${row.search.sentence}` : row.search[filter.scope];
		return words.every((word) => text.includes(word));
	});
}

export type SortKey = "term" | "level" | "definitions" | "note" | "added" | "changed" | "changes" | "teammates";

const LEVEL_ORDER: Record<GridLevel, number> = { unknown: 0, semiknown: 1, known: 2, coworker: 3 };

function compare(a: GridRow, b: GridRow, key: SortKey): number {
	switch (key) {
		case "level":
			return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
		case "definitions":
			return (a.definitions[0] ?? "").localeCompare(b.definitions[0] ?? "");
		case "note":
			return (a.details.file ?? "").localeCompare(b.details.file ?? "");
		case "added":
		case "changed":
			// unknown dates last
			return (a[key] ?? Infinity) - (b[key] ?? Infinity);
		case "changes":
			return a.changes - b.changes;
		case "teammates":
			return a.teammates.length - b.teammates.length;
		default:
			return 0;
	}
}

/** Sorted by `key`, then by word. Doesn't change `rows`. */
export function sortRows(rows: GridRow[], key: SortKey, descending = false): GridRow[] {
	const sign = descending ? -1 : 1;
	return [...rows].sort((a, b) => sign * (compare(a, b, key) || a.term.localeCompare(b.term)));
}

export type GroupBy = "none" | "level" | "note" | "month" | "letter";

export interface RowGroup {
	key: string;
	label: string;
	rows: GridRow[];
}

const LEVEL_LABELS: Record<GridLevel, string> = { unknown: "Unknown", semiknown: "Semi-known", known: "Known", coworker: "Teammates only" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Rows split into groups, keeping their order within each group. */
export function groupRows(rows: GridRow[], by: GroupBy): RowGroup[] {
	if (by === "none") return [{ key: "", label: "", rows }];
	const groups = new Map<string, RowGroup>();
	for (const row of rows) {
		let key: string;
		let label: string;
		if (by === "level") {
			key = String(LEVEL_ORDER[row.level]);
			label = LEVEL_LABELS[row.level];
		} else if (by === "note") {
			label = (row.details.file ?? "").replace(/\.md$/, "") || "No note";
			key = label === "No note" ? "￿" : label.toLowerCase();
		} else if (by === "month") {
			if (row.added === null) {
				key = "0000";
				label = "Date unknown";
			} else {
				const date = new Date(row.added);
				key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
				label = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
			}
		} else {
			const first = row.term.trim().charAt(0).toLocaleUpperCase();
			key = /\p{L}/u.test(first) ? first : "#";
			label = key;
		}
		const group = groups.get(key);
		if (group) group.rows.push(row);
		else groups.set(key, { key, label, rows: [row] });
	}
	const sorted = [...groups.values()];
	// months newest first; everything else in order of its key
	sorted.sort((a, b) => (by === "month" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
	return sorted;
}
