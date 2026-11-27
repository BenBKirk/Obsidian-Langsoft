// Backups of your dictionary, and bringing back what is missing from one.
// Uses only the vault adapter's file functions, so it can be unit tested.
import type { Definition, DictionaryData } from "dictionaries";
import { parseDeviceFile, parseDictionary, serializeDeviceFile } from "dictionary-files";
import { normalizeKeys } from "merge";

/** Where backups are kept: `<folder>/<user>/<date time>.json.gz`, outside the dictionary folder. */
export const BACKUP_FOLDER = "Langsoft backups";
/** If the backups of one user take more than this, the oldest go (the newest few are always kept). */
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const ALWAYS_KEEP = 3;

/** The file functions backups need; Obsidian's vault adapter has them. */
export interface BackupAdapter {
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	list(folder: string): Promise<{ files: string[]; folders: string[] }>;
	readBinary(path: string): Promise<ArrayBuffer>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	remove(path: string): Promise<void>;
	stat(path: string): Promise<{ size: number; mtime: number } | null>;
}

export interface BackupInfo {
	path: string;
	/** When it was made, from its name; for a file copied in with another name, its modification time. */
	date: Date;
	size: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-27 1430" in local time: a backup's name, which sorts by date. */
export function backupStamp(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function stampDate(name: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})/.exec(name);
	return match ? new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]) : null;
}

export function userBackupFolder(user: string): string {
	return `${BACKUP_FOLDER}/${user}`;
}

// --- compressing -------------------------------------------------------------------------

async function pipe(data: Uint8Array<ArrayBuffer>, stream: GenericTransformStream): Promise<Uint8Array<ArrayBuffer>> {
	const response = new Response(new Blob([data]).stream().pipeThrough(stream));
	return new Uint8Array(await response.arrayBuffer());
}

/** Whether this device can compress (CompressionStream; all current Obsidian apps). */
export function canCompress(): boolean {
	return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

/** A backup file's contents: the words as a device file (format 2), gzipped where possible. */
export async function encodeBackup(words: DictionaryData): Promise<{ data: Uint8Array<ArrayBuffer>; extension: string }> {
	const json = new Uint8Array(new TextEncoder().encode(serializeDeviceFile(words)));
	if (!canCompress()) return { data: json, extension: "json" };
	return { data: await pipe(json, new CompressionStream("gzip")), extension: "json.gz" };
}

/**
 * Read a backup: gzipped or plain, as a device file or a one-file-per-user
 * dictionary from before version 1.3 (so old files can be restored too).
 */
export async function decodeBackup(bytes: ArrayBuffer): Promise<{ words: DictionaryData } | { error: string }> {
	let data = new Uint8Array(bytes);
	if (data[0] === 0x1f && data[1] === 0x8b) {
		if (!canCompress()) return { error: "this device can't read compressed backups" };
		try {
			data = await pipe(data, new DecompressionStream("gzip"));
		} catch (e) {
			return { error: `it is damaged (${e})` };
		}
	}
	const text = new TextDecoder().decode(data);
	const device = parseDeviceFile<DictionaryData>(text);
	if ("dict" in device) return { words: normalizeKeys(device.dict) };
	const flat = parseDictionary<DictionaryData>(text);
	if ("dict" in flat && !("format" in flat.dict)) return { words: normalizeKeys(flat.dict) };
	return { error: "error" in flat ? flat.error : device.error };
}

// --- which to keep --------------------------------------------------------------------------

const DAY = 24 * 3600 * 1000;

/**
 * The backups to keep, newest first: the newest of each of the last 14
 * days with a backup, the newest of each week for 13 weeks, and the newest
 * of each month for a year. Then, oldest first, more go while they take
 * more than `maxBytes` together; the newest three always stay.
 */
export function backupsToKeep(backups: BackupInfo[], now = new Date(), maxBytes = MAX_TOTAL_BYTES): BackupInfo[] {
	const newest = [...backups].sort((a, b) => b.date.getTime() - a.date.getTime());
	const keep = new Set<BackupInfo>();
	const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	const weekKey = (d: Date) => {
		const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
		return dayKey(monday);
	};
	const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

	const pick = (key: (d: Date) => string, limit: number, withinDays: number) => {
		const seen = new Set<string>();
		for (const backup of newest) {
			if (now.getTime() - backup.date.getTime() > withinDays * DAY) break;
			const k = key(backup.date);
			if (seen.has(k)) continue;
			seen.add(k);
			keep.add(backup);
			if (seen.size >= limit) break;
		}
	};
	pick(dayKey, 14, Infinity);
	pick(weekKey, 13, 13 * 7);
	pick(monthKey, 12, 366);
	for (const backup of newest.slice(0, ALWAYS_KEEP)) keep.add(backup);

	const kept = newest.filter((b) => keep.has(b));
	let total = kept.reduce((sum, b) => sum + b.size, 0);
	while (total > maxBytes && kept.length > ALWAYS_KEEP) total -= kept.pop()!.size;
	return kept;
}

// --- making and listing backups ------------------------------------------------------------

/** Your backups, newest first. */
export async function listBackups(adapter: BackupAdapter, user: string): Promise<BackupInfo[]> {
	const folder = userBackupFolder(user);
	if (!(await adapter.exists(folder))) return [];
	const backups: BackupInfo[] = [];
	for (const path of (await adapter.list(folder)).files) {
		if (!/\.json(\.gz)?$/.test(path)) continue;
		const stat = await adapter.stat(path);
		const name = path.slice(path.lastIndexOf("/") + 1);
		backups.push({ path, date: stampDate(name) ?? new Date(stat?.mtime ?? 0), size: stat?.size ?? 0 });
	}
	return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Save a backup of `words` and remove backups no longer kept. Returns the new backup's path. */
export async function makeBackup(adapter: BackupAdapter, user: string, words: DictionaryData, now = new Date()): Promise<string> {
	const folder = userBackupFolder(user);
	if (!(await adapter.exists(BACKUP_FOLDER))) await adapter.mkdir(BACKUP_FOLDER);
	if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
	const { data, extension } = await encodeBackup(words);
	let path = `${folder}/${backupStamp(now)}.${extension}`;
	// two in the same minute (e.g. "Back up now" twice): don't overwrite the first
	for (let i = 2; await adapter.exists(path); i++) path = `${folder}/${backupStamp(now)} (${i}).${extension}`;
	await adapter.writeBinary(path, data.slice().buffer);
	await pruneBackups(adapter, user, now);
	return path;
}

export async function pruneBackups(adapter: BackupAdapter, user: string, now = new Date()) {
	const all = await listBackups(adapter, user);
	const keep = new Set(backupsToKeep(all, now).map((b) => b.path));
	for (const backup of all) {
		if (!keep.has(backup.path)) await adapter.remove(backup.path);
	}
}

/** Whether a backup was made today. */
export function backedUpToday(backups: BackupInfo[], now = new Date()): boolean {
	return backups.some((b) => b.date.toDateString() === now.toDateString());
}

// --- bringing back what is missing -----------------------------------------------------------

export interface RestoreItem {
	term: string;
	/** True if the word has no definition now, so it comes back whole, with its level from the backup. */
	wholeWord: boolean;
	level: string;
	definitions: { definition: string; details: Definition }[];
}

/**
 * What a backup has that your dictionary is missing now: words with no
 * definition left now, and definitions deleted (or gone) since. Nothing
 * added or changed since is touched. Phrases' first words come back with
 * the phrase.
 */
export function planRestore(current: DictionaryData, backup: DictionaryData): RestoreItem[] {
	const items: RestoreItem[] = [];
	for (const [term, entry] of Object.entries(backup ?? {})) {
		if (!entry || !["unknown", "semiknown", "known"].includes(entry.highlight)) continue;
		const then = Object.entries(entry.definitions ?? {}).filter(([, d]) => d && !d.deleted);
		if (then.length === 0) continue;
		const now = current?.[term];
		const liveNow = new Set(Object.entries(now?.definitions ?? {}).filter(([, d]) => d && !d.deleted).map(([d]) => d));
		const missing = then.filter(([definition]) => !liveNow.has(definition));
		if (missing.length === 0) continue;
		items.push({
			term,
			wholeWord: liveNow.size === 0,
			level: entry.highlight,
			definitions: missing.map(([definition, details]) => ({ definition, details })),
		});
	}
	return items.sort((a, b) => a.term.localeCompare(b.term));
}
