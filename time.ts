// Timestamps saved with definitions and level changes. No Obsidian dependency, so it can be unit tested.

/**
 * Now, as saved from version 1.8: UTC, e.g. "2026-11-26T10:15:00Z", so it
 * means the same moment on every device, whatever its time zone.
 */
export function nowTimestamp(date = new Date()): string {
	return `${date.toISOString().slice(0, 19)}Z`;
}

const WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Read a saved timestamp: with a time zone (UTC, from version 1.8), or
 * "YYYY-MM-DD HH:mm:ss" in local time (before; no time zone was saved, so
 * the device reading it assumes its own). Null if it is neither.
 */
export function parseTimestamp(text: string | undefined): Date | null {
	const value = (text ?? "").trim();
	if (WITH_ZONE.test(value)) {
		const time = Date.parse(value);
		return Number.isNaN(time) ? null : new Date(time);
	}
	const match = LOCAL.exec(value);
	if (!match) return null;
	const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
	const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Order two timestamps by the moment they mean, whichever way each was saved; unreadable ones come first. */
export function compareTimestamps(a: string | undefined, b: string | undefined): number {
	const x = parseTimestamp(a)?.getTime();
	const y = parseTimestamp(b)?.getTime();
	if (x === undefined && y === undefined) {
		const p = a ?? "";
		const q = b ?? "";
		return p < q ? -1 : p > q ? 1 : 0;
	}
	if (x === undefined) return -1;
	if (y === undefined) return 1;
	return x < y ? -1 : x > y ? 1 : 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "27 Nov 2026", or "27 Nov 26" with `shortYear`, in local time. */
export function formatDay(date: Date, shortYear = false): string {
	const year = String(date.getFullYear());
	return `${date.getDate()} ${MONTHS[date.getMonth()]} ${shortYear ? year.slice(2) : year}`;
}

/** "14:30" in local time. */
export function formatClock(date: Date): string {
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "2026-11-27 1430" in local time, for file names. */
export function formatFileStamp(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** "Today, 14:30", "Yesterday, 09:05" or "Fri 27 Nov 2026, 14:30", relative to `now`. */
export function formatRecent(date: Date, now = new Date()): string {
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((day(now) - day(date)) / (24 * 3600 * 1000));
	if (days === 0) return `Today, ${formatClock(date)}`;
	if (days === 1) return `Yesterday, ${formatClock(date)}`;
	return `${WEEKDAYS[date.getDay()]} ${formatDay(date)}, ${formatClock(date)}`;
}
