// Progress statistics from the level history of each word. No Obsidian
// dependency, so it can be unit tested. All dates are in local time, like
// the timestamps they are computed from.
import type { DictionaryData, WordEntry } from "dictionaries";
import { parseTimestamp } from "time";

export type PeriodKind = "week" | "month" | "year";
export type Level = "unknown" | "semiknown" | "known";
export const LEVELS: Level[] = ["unknown", "semiknown", "known"];

export interface PeriodStats {
	/** E.g. "24 Nov", "Nov 2026", "2026". */
	label: string;
	start: Date;
	/** The start of the next period. */
	end: Date;
	/** Words at each level at the end of the period (or now, for the current period). */
	totals: Record<Level, number>;
	/** Words that reached each level during the period, i.e. weren't at it at the start. */
	reached: Record<Level, number>;
	/** Words that had no level at the start and one at the end. */
	newWords: number;
}

export { parseTimestamp };

/** The start of the week (Monday), month or year containing `date`. */
export function periodStart(date: Date, kind: PeriodKind): Date {
	if (kind === "year") return new Date(date.getFullYear(), 0, 1);
	if (kind === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
	const daysSinceMonday = (date.getDay() + 6) % 7;
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
}

/** The start of the period `steps` periods after the one starting at `start`. */
export function addPeriods(start: Date, kind: PeriodKind, steps: number): Date {
	if (kind === "year") return new Date(start.getFullYear() + steps, 0, 1);
	if (kind === "month") return new Date(start.getFullYear(), start.getMonth() + steps, 1);
	return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * steps);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(start: Date, kind: PeriodKind): string {
	if (kind === "year") return String(start.getFullYear());
	if (kind === "month") return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
	return `${start.getDate()} ${MONTHS[start.getMonth()]}`;
}

/** A word's level changes in time order, with "None" for "removed". */
export type Timeline = { time: number; level: string }[];

/**
 * The level changes of each word that has a definition now. Words with no
 * definition left are not counted at all: when the last definition was
 * deleted wasn't recorded before version 1.5, so they can't be placed in
 * time. Words with no usable history fall back to their oldest definition.
 */
function timelines(dict: DictionaryData): Timeline[] {
	return [...timelinesByTerm(dict).values()];
}

export function timelinesByTerm(dict: DictionaryData): Map<string, Timeline> {
	const result = new Map<string, Timeline>();
	for (const [term, entry] of Object.entries(dict ?? {}) as [string, WordEntry | undefined][]) {
		if (!entry) continue;
		const definitions = Object.values(entry.definitions ?? {});
		if (!definitions.some((d) => d && !d.deleted)) continue;

		let timeline: Timeline = (entry.highlighthistory ?? [])
			.map((h) => ({ time: parseTimestamp(h?.timestamp)?.getTime() ?? NaN, level: h?.level }))
			.filter((h) => !Number.isNaN(h.time) && typeof h.level === "string");
		if (!timeline.some((h) => isLevel(h.level)) && isLevel(entry.highlight)) {
			const first = Math.min(...definitions.map((d) => parseTimestamp(d?.timestamp)?.getTime() ?? Infinity));
			timeline = Number.isFinite(first) ? [{ time: first, level: entry.highlight }] : [];
		}
		timeline.sort((a, b) => a.time - b.time);
		if (timeline.length > 0) result.set(term, timeline);
	}
	return result;
}

function isLevel(level: unknown): level is Level {
	return level === "unknown" || level === "semiknown" || level === "known";
}

/** The level a word was at, at a moment (just before `time`); null if it had none. */
export function levelAt(timeline: Timeline, time: number): Level | null {
	let level: string | null = null;
	for (const change of timeline) {
		if (change.time >= time) break;
		level = change.level;
	}
	return isLevel(level) ? level : null;
}

const zero = (): Record<Level, number> => ({ unknown: 0, semiknown: 0, known: 0 });

/**
 * Statistics for consecutive periods, oldest first, ending with the one
 * containing `now`: 12 weeks, 12 months, or every year since the first
 * recorded change (at least one).
 */
export function computeProgress(dict: DictionaryData, kind: PeriodKind, now = new Date()): PeriodStats[] {
	const words = timelines(dict);
	const current = periodStart(now, kind);
	const count = periodCount(Math.min(...words.map((t) => t[0].time)), kind, now);

	const periods: PeriodStats[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const start = addPeriods(current, kind, -i);
		const end = addPeriods(start, kind, 1);
		// the current period counts up to now; later changes (e.g. a clock set wrong) are left out
		const until = Math.min(end.getTime(), now.getTime() + 1);
		const stats: PeriodStats = { label: label(start, kind), start, end, totals: zero(), reached: zero(), newWords: 0 };
		for (const timeline of words) {
			const before = levelAt(timeline, start.getTime());
			const after = levelAt(timeline, until);
			if (after === null) continue;
			stats.totals[after]++;
			if (after !== before) stats.reached[after]++;
			if (before === null) stats.newWords++;
		}
		periods.push(stats);
	}
	return periods;
}

/**
 * How many periods the statistics cover: 12 weeks, 12 months, or every
 * year from the year of `firstTime` (the earliest change) up to now.
 */
export function periodCount(firstTime: number, kind: PeriodKind, now: Date): number {
	if (kind !== "year") return 12;
	const firstYear = Number.isFinite(firstTime) ? new Date(firstTime).getFullYear() : now.getFullYear();
	// from the first year with a change up to now, at most 50 years (in case of a wrong date)
	const from = Math.max(Math.min(firstYear, now.getFullYear()), now.getFullYear() - 49);
	return now.getFullYear() - from + 1;
}

/**
 * The moments a growth curve is drawn at, from `from` to now: daily for
 * weeks, weekly for months, monthly for years. The last one is now.
 */
export function seriesTimes(from: Date, kind: PeriodKind, now: Date): Date[] {
	const step = (date: Date): Date =>
		kind === "week"
			? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
			: kind === "month"
				? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7)
				: new Date(date.getFullYear(), date.getMonth() + 1, 1);
	const times: Date[] = [];
	for (let t = from; t.getTime() < now.getTime(); t = step(t)) times.push(t);
	times.push(now);
	return times;
}

export interface GrowthPoint {
	time: Date;
	/** Words at each level just before `time`. */
	totals: Record<Level, number>;
}

/**
 * Words at each level over the same range as computeProgress: daily for
 * weeks, weekly for months, monthly for years. The last point is now.
 */
export function growthSeries(dict: DictionaryData, kind: PeriodKind, now = new Date()): GrowthPoint[] {
	const words = timelines(dict);
	const from = computeProgress(dict, kind, now)[0].start;
	return seriesTimes(from, kind, now).map((time) => {
		const totals = zero();
		const until = time === now ? now.getTime() + 1 : time.getTime();
		for (const timeline of words) {
			const level = levelAt(timeline, until);
			if (level) totals[level]++;
		}
		return { time, totals };
	});
}

/** "2026-11-25": a local date, as used for the activity calendar. */
export function dayKey(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface ActivityCalendar {
	/** Every day from the Monday 52 weeks before this week up to today, oldest first. */
	days: { date: Date; count: number }[];
	/** The highest count in `days`. */
	max: number;
	/** Days in a row with activity, up to today (or yesterday, if nothing yet today). */
	currentStreak: number;
	/** The longest run of days in a row with activity, ever. */
	longestStreak: number;
	/** Days with activity within `days`. */
	activeDays: number;
}

/**
 * How much was done each day: words added and level changes, counted from
 * every word's history, including words deleted since.
 */
export function activityCalendar(dict: DictionaryData, now = new Date()): ActivityCalendar {
	const perDay = new Map<string, number>();
	for (const entry of Object.values(dict ?? {}) as (WordEntry | undefined)[]) {
		for (const change of entry?.highlighthistory ?? []) {
			if (!isLevel(change?.level)) continue;
			const time = parseTimestamp(change.timestamp);
			if (!time) continue;
			const key = dayKey(time);
			perDay.set(key, (perDay.get(key) ?? 0) + 1);
		}
	}

	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const first = addPeriods(periodStart(today, "week"), "week", -52);
	const days: { date: Date; count: number }[] = [];
	for (let d = first; d.getTime() <= today.getTime(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
		days.push({ date: d, count: perDay.get(dayKey(d)) ?? 0 });
	}

	const active = (date: Date) => (perDay.get(dayKey(date)) ?? 0) > 0;
	const previous = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
	let currentStreak = 0;
	// today doesn't break the streak until it is over
	let d = active(today) ? today : previous(today);
	while (active(d)) {
		currentStreak++;
		d = previous(d);
	}

	let longestStreak = 0;
	let run = 0;
	let last: Date | null = null;
	for (const key of [...perDay.keys()].sort()) {
		const date = parseTimestamp(key);
		if (!date || date.getTime() > today.getTime()) continue;
		run = last && dayKey(previous(date)) === dayKey(last) ? run + 1 : 1;
		longestStreak = Math.max(longestStreak, run);
		last = date;
	}

	return {
		days,
		max: Math.max(0, ...days.map((day) => day.count)),
		currentStreak,
		longestStreak,
		activeDays: days.filter((day) => day.count > 0).length,
	};
}
