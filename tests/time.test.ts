import { describe, expect, it } from "vitest";
import { compareTimestamps, formatClock, formatDay, formatFileStamp, formatRecent, nowTimestamp, parseTimestamp } from "../time";

describe("nowTimestamp", () => {
	it("saves the moment in UTC, to the second", () => {
		expect(nowTimestamp(new Date(Date.UTC(2026, 10, 26, 10, 15, 30, 999)))).toBe("2026-11-26T10:15:30Z");
	});
});

describe("parseTimestamp", () => {
	it("reads UTC and other time zones exactly", () => {
		expect(parseTimestamp("2026-11-26T10:15:30Z")?.getTime()).toBe(Date.UTC(2026, 10, 26, 10, 15, 30));
		expect(parseTimestamp("2026-11-26T12:15:30+02:00")?.getTime()).toBe(Date.UTC(2026, 10, 26, 10, 15, 30));
	});

	it("reads timestamps from before 1.8 in local time", () => {
		expect(parseTimestamp("2026-11-26 10:15:30")).toEqual(new Date(2026, 10, 26, 10, 15, 30));
		expect(parseTimestamp("2026-11-26")).toEqual(new Date(2026, 10, 26));
	});

	it("rejects anything else", () => {
		expect(parseTimestamp("yesterday")).toBeNull();
		expect(parseTimestamp("")).toBeNull();
		expect(parseTimestamp(undefined)).toBeNull();
		expect(parseTimestamp("2026-11-26T10:15:30Zjunk")).toBeNull();
	});
});

describe("compareTimestamps", () => {
	it("orders by the moment meant, across formats", () => {
		const local = "2026-11-26 10:00:00";
		const sameMomentUtc = nowTimestamp(new Date(2026, 10, 26, 10, 0, 0));
		const laterUtc = nowTimestamp(new Date(2026, 10, 26, 10, 0, 1));
		expect(compareTimestamps(local, sameMomentUtc)).toBe(0);
		expect(compareTimestamps(local, laterUtc)).toBe(-1);
		expect(compareTimestamps(laterUtc, local)).toBe(1);
	});

	it("puts unreadable timestamps first", () => {
		expect(compareTimestamps("garbage", "2026-01-01 00:00:00")).toBe(-1);
		expect(compareTimestamps("2026-01-01T00:00:00Z", undefined)).toBe(1);
		expect(compareTimestamps(undefined, undefined)).toBe(0);
	});
});

describe("formatting dates", () => {
	const date = new Date(2026, 10, 27, 9, 5);

	it("formats days, times and file stamps", () => {
		expect(formatDay(date)).toBe("27 Nov 2026");
		expect(formatDay(date, true)).toBe("27 Nov 26");
		expect(formatClock(date)).toBe("09:05");
		expect(formatFileStamp(date)).toBe("2026-11-27 0905");
	});

	it("says today and yesterday, otherwise the full date", () => {
		expect(formatRecent(date, new Date(2026, 10, 27, 23, 0))).toBe("Today, 09:05");
		expect(formatRecent(date, new Date(2026, 10, 28, 0, 30))).toBe("Yesterday, 09:05");
		expect(formatRecent(date, new Date(2026, 11, 2))).toBe("Fri 27 Nov 2026, 09:05");
		expect(formatRecent(new Date(2026, 0, 1, 12), new Date(2026, 0, 2, 1))).toBe("Yesterday, 12:00");
	});
});
