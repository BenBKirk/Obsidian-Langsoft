import { describe, expect, it } from "vitest";
import {
	activityCalendar,
	addPeriods,
	computeProgress,
	dayKey,
	growthSeries,
	parseTimestamp,
	periodStart,
} from "../progress";
import type { DictionaryData, WordEntry } from "../dictionaries";

/** A word with a definition and level changes at the given times. */
const word = (history: [string, string][], deleted = false): WordEntry => ({
	highlight: history.length ? history[history.length - 1][0] : "None",
	definitions: { meaning: { deleted, timestamp: history[0]?.[1] ?? "", sentence: "" } },
	highlighthistory: history.map(([level, timestamp]) => ({ level, timestamp })),
	firstwordofphrase: [],
});

/** The last element (Array.prototype.at isn't in the ES2018 library this project targets). */
const last = <T>(items: T[]): T => items[items.length - 1];

// Wednesday 25 November 2026, 12:00 local time
const NOW = new Date(2026, 10, 25, 12, 0, 0);

describe("dates", () => {
	it("parse Langsoft timestamps in local time", () => {
		expect(parseTimestamp("2026-11-25 08:30:15")).toEqual(new Date(2026, 10, 25, 8, 30, 15));
		expect(parseTimestamp("2026-11-25")).toEqual(new Date(2026, 10, 25));
		expect(parseTimestamp("yesterday")).toBeNull();
		expect(parseTimestamp(undefined)).toBeNull();
	});

	it("start weeks on Monday, months on the 1st and years on 1 January", () => {
		expect(periodStart(NOW, "week")).toEqual(new Date(2026, 10, 23));
		expect(periodStart(new Date(2026, 10, 29, 23), "week")).toEqual(new Date(2026, 10, 23)); // Sunday
		expect(periodStart(new Date(2026, 10, 23), "week")).toEqual(new Date(2026, 10, 23)); // Monday
		expect(periodStart(NOW, "month")).toEqual(new Date(2026, 10, 1));
		expect(periodStart(NOW, "year")).toEqual(new Date(2026, 0, 1));
	});

	it("step across month and year ends", () => {
		expect(addPeriods(new Date(2026, 11, 28), "week", 1)).toEqual(new Date(2027, 0, 4));
		expect(addPeriods(new Date(2026, 0, 1), "month", -1)).toEqual(new Date(2025, 11, 1));
		expect(addPeriods(new Date(2026, 0, 1), "year", 1)).toEqual(new Date(2027, 0, 1));
	});
});

describe("computeProgress", () => {
	const dict: DictionaryData = {
		// added in October, known in November
		hund: word([
			["unknown", "2026-10-05 10:00:00"],
			["known", "2026-11-10 10:00:00"],
		]),
		// added in November, semi-known the same month
		katze: word([
			["unknown", "2026-11-02 10:00:00"],
			["semiknown", "2026-11-20 10:00:00"],
		]),
		// added this week
		maus: word([["unknown", "2026-11-24 09:00:00"]]),
		// all definitions deleted: left out entirely
		weg: word([["known", "2026-09-01 10:00:00"]], true),
		// a phrase's first word, without a definition of its own
		the: { highlight: "None", definitions: {}, highlighthistory: [{ level: "None", timestamp: "2026-11-01 10:00:00" }], firstwordofphrase: ["the end"] },
	};

	it("gives 12 months, oldest first, ending with this one", () => {
		const months = computeProgress(dict, "month", NOW);
		expect(months).toHaveLength(12);
		expect(months[0].label).toBe("Dec 2025");
		expect(months[11].label).toBe("Nov 2026");
	});

	it("counts the words at each level at the end of each period", () => {
		const months = computeProgress(dict, "month", NOW);
		const [sep, oct, nov] = months.slice(-3);
		expect(sep.totals).toEqual({ unknown: 0, semiknown: 0, known: 0 });
		expect(oct.totals).toEqual({ unknown: 1, semiknown: 0, known: 0 });
		expect(nov.totals).toEqual({ unknown: 1, semiknown: 1, known: 1 });
	});

	it("counts the words that reached a level, and new words, during each period", () => {
		const nov = computeProgress(dict, "month", NOW)[11];
		expect(nov.reached).toEqual({ unknown: 1, semiknown: 1, known: 1 });
		expect(nov.newWords).toBe(2);

		const oct = computeProgress(dict, "month", NOW)[10];
		expect(oct.reached).toEqual({ unknown: 1, semiknown: 0, known: 0 });
		expect(oct.newWords).toBe(1);
	});

	it("does weeks", () => {
		const weeks = computeProgress(dict, "week", NOW);
		expect(weeks).toHaveLength(12);
		const thisWeek = weeks[11];
		expect(thisWeek.label).toBe("23 Nov");
		expect(thisWeek.newWords).toBe(1); // maus
		expect(thisWeek.totals).toEqual({ unknown: 1, semiknown: 1, known: 1 });
		const lastWeek = weeks[10]; // 16–22 Nov: katze became semi-known on the 20th
		expect(lastWeek.reached).toEqual({ unknown: 0, semiknown: 1, known: 0 });
	});

	it("does every year since the first change", () => {
		const years = computeProgress({ ...dict, alt: word([["known", "2024-03-01 10:00:00"]]) }, "year", NOW);
		expect(years.map((y) => y.label)).toEqual(["2024", "2025", "2026"]);
		expect(years[0].totals.known).toBe(1);
		expect(years[2].totals).toEqual({ unknown: 1, semiknown: 1, known: 2 });
	});

	it("gives one year for an empty dictionary", () => {
		const years = computeProgress({}, "year", NOW);
		expect(years).toHaveLength(1);
		expect(years[0].totals).toEqual({ unknown: 0, semiknown: 0, known: 0 });
	});

	it("does not count a word that went back to its old level as having reached it", () => {
		const back = { w: word([
			["known", "2026-10-01 10:00:00"],
			["unknown", "2026-11-03 10:00:00"],
			["known", "2026-11-05 10:00:00"],
		]) };
		expect(computeProgress(back, "month", NOW)[11].reached.known).toBe(0);
	});

	it("uses removal entries recorded since version 1.5", () => {
		const removed = { w: word([
			["known", "2026-10-01 10:00:00"],
			["None", "2026-11-03 10:00:00"],
			["unknown", "2026-11-05 10:00:00"],
		]) };
		const [oct, nov] = computeProgress(removed, "month", NOW).slice(-2);
		expect(oct.totals.known).toBe(1);
		expect(nov.totals).toEqual({ unknown: 1, semiknown: 0, known: 0 });
		expect(nov.newWords).toBe(0);
	});

	it("leaves out changes dated after now", () => {
		const future = { w: word([["known", "2026-11-28 10:00:00"]]) };
		expect(computeProgress(future, "month", NOW)[11].totals.known).toBe(0);
	});

	it("falls back to the oldest definition when there is no usable history", () => {
		const old: DictionaryData = {
			w: { highlight: "known", definitions: { a: { deleted: false, timestamp: "2026-10-01 10:00:00", sentence: "" } }, highlighthistory: [], firstwordofphrase: [] },
			x: { highlight: "known", definitions: { a: { deleted: false, timestamp: "garbage", sentence: "" } }, highlighthistory: [{ level: "known", timestamp: "garbage" }], firstwordofphrase: [] },
		};
		expect(computeProgress(old, "month", NOW)[11].totals.known).toBe(1);
	});
});

describe("growthSeries", () => {
	const dict: DictionaryData = {
		hund: word([
			["unknown", "2026-10-05 10:00:00"],
			["known", "2026-11-10 10:00:00"],
		]),
		maus: word([["unknown", "2026-11-24 09:00:00"]]),
	};

	it("has a point a day for weeks, a week for months and a month for years, ending now", () => {
		const weeks = growthSeries(dict, "week", NOW);
		expect(weeks[0].time).toEqual(new Date(2026, 8, 7)); // Monday 11 weeks before this week
		expect(weeks[1].time).toEqual(new Date(2026, 8, 8));
		expect(last(weeks).time).toEqual(NOW);

		const months = growthSeries(dict, "month", NOW);
		expect(months[1].time.getTime() - months[0].time.getTime()).toBeGreaterThanOrEqual(6.9 * 24 * 3600 * 1000);
		expect(last(months).time).toEqual(NOW);

		const years = growthSeries(dict, "year", NOW);
		expect(years[0].time).toEqual(new Date(2026, 0, 1));
		expect(years[1].time).toEqual(new Date(2026, 1, 1));
	});

	it("counts the words at each level at each point", () => {
		const series = growthSeries(dict, "week", NOW);
		const at = (y: number, m: number, d: number) => series.find((p) => p.time.getTime() === new Date(y, m, d).getTime())!.totals;
		expect(at(2026, 9, 5)).toEqual({ unknown: 0, semiknown: 0, known: 0 }); // just before hund was added
		expect(at(2026, 9, 6)).toEqual({ unknown: 1, semiknown: 0, known: 0 });
		expect(at(2026, 10, 11)).toEqual({ unknown: 0, semiknown: 0, known: 1 });
		expect(last(series).totals).toEqual({ unknown: 1, semiknown: 0, known: 1 });
	});
});

describe("activityCalendar", () => {
	const day = (d: string, level = "unknown"): [string, string] => [level, `${d} 10:00:00`];

	it("covers the last 53 weeks, from a Monday up to today", () => {
		const calendar = activityCalendar({}, NOW);
		expect(calendar.days[0].date.getDay()).toBe(1);
		expect(last(calendar.days).date).toEqual(new Date(2026, 10, 25));
		expect(calendar.days.length).toBe(52 * 7 + 3);
		expect(calendar).toMatchObject({ max: 0, currentStreak: 0, longestStreak: 0, activeDays: 0 });
	});

	it("counts additions and level changes per day, including deleted words", () => {
		const dict = {
			a: word([day("2026-11-20"), day("2026-11-24", "known")]),
			b: word([day("2026-11-24")], true),
			c: { highlight: "None", definitions: {}, highlighthistory: [{ level: "None", timestamp: "2026-11-24 10:00:00" }], firstwordofphrase: [] },
		};
		const calendar = activityCalendar(dict, NOW);
		const count = (key: string) => calendar.days.find((d) => dayKey(d.date) === key)!.count;
		expect(count("2026-11-24")).toBe(2);
		expect(count("2026-11-20")).toBe(1);
		expect(calendar.max).toBe(2);
		expect(calendar.activeDays).toBe(2);
	});

	it("works out streaks; today doesn't break one until it is over", () => {
		const dict = {
			a: word([day("2026-11-22"), day("2026-11-23", "semiknown"), day("2026-11-24", "known")]),
			b: word([day("2026-10-01"), day("2026-10-02", "known"), day("2026-10-03", "unknown"), day("2026-10-04", "known")]),
		};
		expect(activityCalendar(dict, NOW)).toMatchObject({ currentStreak: 3, longestStreak: 4 });
		const withToday = { ...dict, c: word([day("2026-11-25")]) };
		expect(activityCalendar(withToday, NOW).currentStreak).toBe(4);
		expect(activityCalendar(dict, new Date(2026, 10, 27)).currentStreak).toBe(0);
	});

	it("counts streaks across month and year ends", () => {
		const dict = { a: word([day("2025-12-31"), day("2026-01-01", "known")]) };
		expect(activityCalendar(dict, NOW).longestStreak).toBe(2);
	});
});
