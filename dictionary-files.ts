// Rules for dictionary file names, with no Obsidian dependency so they can be unit tested.

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
