// Rules for dictionary file names, with no Obsidian dependency so they can be unit tested.

/** Where dictionaries are kept by default: a normal, visible folder, so every sync tool includes it. */
export const DEFAULT_FOLDER = "Langsoft";
/** The default folder before version 1.2. Hidden, which some sync tools (e.g. Obsidian Sync) skip. */
export const LEGACY_FOLDER = ".langsoft_dictionaries";

/** Syncthing names the losing side of a conflict `<name>.sync-conflict-<date>-<time>-<device>.<ext>`. */
const SYNC_CONFLICT = /\.sync-conflict-[^.]*/;

/** The file name without its folder and without ".json": "dicts/maria.json" -> "maria". */
export function dictionaryName(path: string): string {
	const fileName = path.slice(path.lastIndexOf("/") + 1);
	return fileName.endsWith(".json") ? fileName.slice(0, -".json".length) : fileName;
}

/** True for a copy Syncthing made of a file during a sync conflict. */
export function isSyncConflict(path: string): boolean {
	return SYNC_CONFLICT.test(dictionaryName(path));
}

/** The name of the dictionary a conflict copy belongs to: "maria.sync-conflict-...json" -> "maria". */
export function conflictOwner(path: string): string {
	return dictionaryName(path).replace(SYNC_CONFLICT, "");
}

/**
 * Read the text of a dictionary file. An empty file is an empty
 * dictionary. Anything that isn't a JSON object is an error, with a
 * message saying what is wrong.
 */
export function parseDictionary<T = Record<string, unknown>>(text: string): { dict: T } | { error: string } {
	if (text.trim() === "") return { dict: {} as T };
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return { error: "it does not contain a JSON object" };
	}
	return { dict: value as T };
}

/**
 * Group dictionary files by whose they are, e.g. one user's file in the
 * current folder and in the old one. Conflict copies and files that aren't
 * JSON are left out. Paths keep their order within each group.
 */
export function groupDictionaries(paths: string[]): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const path of paths) {
		if (!path.endsWith(".json") || isSyncConflict(path)) continue;
		const name = dictionaryName(path);
		if (name === "") continue;
		groups.set(name, [...(groups.get(name) ?? []), path]);
	}
	return groups;
}

/**
 * One file that holds (part of) a user's dictionary.
 *
 * - "device": `<folder>/<user>/<device>.json`, written by one device only (1.3 and later)
 * - "flat": `<folder>/<user>.json`, one file per user (1.2)
 * - "legacy": `<old folder>/<user>.json` (1.1 and earlier)
 *
 * Only a device's own device file is ever written; everything else is read
 * and merged in. A Syncthing conflict copy of any of them counts as a
 * source for the same user.
 */
export interface DictionarySource {
	path: string;
	user: string;
	kind: "device" | "flat" | "legacy";
	conflict: boolean;
}

function parentOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? "" : path.slice(0, slash);
}

/** What a file in the dictionary folders is, or null if it isn't a dictionary. */
export function classifyDictionaryPath(path: string, folder: string, legacyFolder: string | null): DictionarySource | null {
	if (!path.endsWith(".json")) return null;
	const conflict = isSyncConflict(path);
	const fileName = conflict ? conflictOwner(path) : dictionaryName(path);
	const parent = parentOf(path);

	if (legacyFolder !== null && parent === legacyFolder) {
		return fileName ? { path, user: fileName, kind: "legacy", conflict } : null;
	}
	if (parent === folder) {
		return fileName ? { path, user: fileName, kind: "flat", conflict } : null;
	}
	if (parentOf(parent) === folder) {
		const user = parent.slice(parent.lastIndexOf("/") + 1);
		return user && fileName ? { path, user, kind: "device", conflict } : null;
	}
	return null;
}

/** Version of the device file format, stored in each device file. */
export const DEVICE_FILE_FORMAT = 2;

/** The contents of a device file: `{ "format": 2, "words": { ... } }`. */
export function serializeDeviceFile(words: unknown): string {
	return JSON.stringify({ format: DEVICE_FILE_FORMAT, words });
}

/** Read a device file. An empty file is an empty dictionary. */
export function parseDeviceFile<T = Record<string, unknown>>(text: string): { dict: T } | { error: string } {
	const result = parseDictionary<Record<string, unknown>>(text);
	if ("error" in result) return result;
	if (Object.keys(result.dict).length === 0) return { dict: {} as T };
	const { format, words } = result.dict;
	if (format !== DEVICE_FILE_FORMAT) {
		return { error: `unknown format ${JSON.stringify(format)}; a newer version of Langsoft may be needed` };
	}
	if (typeof words !== "object" || words === null || Array.isArray(words)) {
		return { error: "it has no word list" };
	}
	return { dict: words as T };
}

/** Read any dictionary source: device files are wrapped, older files aren't. */
export function parseSource<T = Record<string, unknown>>(source: DictionarySource, text: string): { dict: T } | { error: string } {
	return source.kind === "device" ? parseDeviceFile<T>(text) : parseDictionary<T>(text);
}
