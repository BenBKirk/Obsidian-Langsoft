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
