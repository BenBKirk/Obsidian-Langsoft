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
