import { describe, expect, it } from "vitest";
import { compareTimestamps, nowTimestamp, parseTimestamp } from "../time";

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
