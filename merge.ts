// Combining two versions of the same dictionary, e.g. the copy in memory
// and a newer copy another device synced to disk. No Obsidian dependency,
// so it can be unit tested.
import type { Definition, DictionaryData, HighlightHistoryEntry, WordEntry } from "dictionaries";

/**
 * Merge two versions of one dictionary without losing anything either
 * side added:
 *
 * - words and phrases: all of them
 * - definitions: all of them; when both have the same definition, the one
 *   with the later timestamp wins (re-adding a deleted definition gives it
 *   a new timestamp), and on a tie a deletion wins
 * - highlight history: both histories, in time order
 * - current highlight: "None" if no definition is left, otherwise the
 *   latest level in the history
 *
 * Timestamps are compared as "YYYY-MM-DD HH:mm:ss" strings in each
 * device's local time, so devices should be in the same time zone.
 */
export function mergeDictionaries(a: DictionaryData, b: DictionaryData): DictionaryData {
	const merged: DictionaryData = {};
	for (const term of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const x = a[term];
		const y = b[term];
		merged[term] = x && y ? mergeEntries(x, y) : structuredClone(x ?? y);
	}
	return merged;
}

function mergeEntries(x: WordEntry, y: WordEntry): WordEntry {
	const definitions: Record<string, Definition> = {};
	const xDefs = x.definitions ?? {};
	const yDefs = y.definitions ?? {};
	for (const key of new Set([...Object.keys(xDefs), ...Object.keys(yDefs)])) {
		const dx = xDefs[key];
		const dy = yDefs[key];
		definitions[key] = structuredClone(dx && dy ? pickDefinition(dx, dy) : dx ?? dy);
	}

	const seen = new Set<string>();
	const highlighthistory: HighlightHistoryEntry[] = [];
	for (const entry of [...(x.highlighthistory ?? []), ...(y.highlighthistory ?? [])]) {
		const key = `${entry.level}\u0000${entry.timestamp}`;
		if (seen.has(key)) continue;
		seen.add(key);
		highlighthistory.push({ ...entry });
	}
	// stable, so entries with the same timestamp keep their order
	highlighthistory.sort((p, q) => compare(p.timestamp, q.timestamp));

	const firstwordofphrase = [...new Set([...(x.firstwordofphrase ?? []), ...(y.firstwordofphrase ?? [])])];

	return {
		highlight: currentHighlight(definitions, highlighthistory, x, y),
		definitions,
		highlighthistory,
		firstwordofphrase,
	};
}

function pickDefinition(dx: Definition, dy: Definition): Definition {
	const order = compare(dx.timestamp, dy.timestamp);
	if (order !== 0) return order > 0 ? dx : dy;
	if (dx.deleted !== dy.deleted) return dx.deleted ? dx : dy;
	return dx;
}

function currentHighlight(
	definitions: Record<string, Definition>,
	history: HighlightHistoryEntry[],
	x: WordEntry,
	y: WordEntry
): string {
	if (!Object.values(definitions).some((d) => !d.deleted)) return "None";
	for (let i = history.length - 1; i >= 0; i--) {
		if (history[i].level !== "None") return history[i].level;
	}
	return x.highlight !== "None" ? x.highlight : y.highlight;
}

function compare(p: string | undefined, q: string | undefined): number {
	const a = p ?? "";
	const b = q ?? "";
	return a < b ? -1 : a > b ? 1 : 0;
}
