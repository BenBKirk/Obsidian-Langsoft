import type LangsoftPlugin from "main";
import { moment, normalizePath, Notice } from "obsidian";
import { conflictOwner, DEFAULT_FOLDER, dictionaryName, groupDictionaries, isSyncConflict, LEGACY_FOLDER, parseDictionary } from "dictionary-files";
import { mergeDictionaries } from "merge";


export interface Definition {
	deleted: boolean;
	timestamp: string; // Could use Date if you plan to parse it
	file?: string; // name of the note the definition was added in (missing if no note was open)
	sentence: string; // the surrounding text, with the selection wrapped in <u></u>
}

export interface HighlightHistoryEntry {
	level: string; // Could also be an enum like 'unknown' | 'semi-known' | 'known'
	timestamp: string;
}

export interface WordEntry {
	highlight: string; // Could be 'known' | 'unknown' | etc.
	definitions: Record<string, Definition>; // Key is the definition name (e.g., "husband")
	highlighthistory: HighlightHistoryEntry[];
	firstwordofphrase: string[];
}

export interface BookShelf {
	[key: string]: DictionaryData;
}

export type DictionaryData = Record<string, WordEntry>;


export class DictionaryManager {
	plugin: LangsoftPlugin;
	userDict: DictionaryData;
	otherDicts: BookShelf;
	dictFolder: string;
	availableDictionaries: string[] = [];
	/**
	 * The folder dictionaries were kept in before version 1.2, while it still
	 * exists. Dictionaries there are still read, so teammates who haven't
	 * updated stay visible, and your own old file is copied and merged in.
	 * It is never written to.
	 */
	legacyFolder: string | null = null;
	legacyDictionaries: string[] = [];
	/** Modification time of your own file in the old folder when it was last merged in. */
	private legacyOwnMtime: number | undefined;
	wordnet: string;
	/** Modification time of each coworker dictionary when it was last read, by path. */
	private coworkerMtimes: Record<string, number | undefined> = {};
	/** Conflict copies already reported in a notice, so each is only mentioned once. */
	private reportedConflicts = new Set<string>();

	/** Modification time of the user's own dictionary when it was last read or written. */
	private userDictMtime: number | undefined;
	/**
	 * Why the user's dictionary file couldn't be read, or null if it could.
	 * While it can't be read, it is never written: that would replace it
	 * with only what is in memory.
	 */
	unreadableReason: string | null = null;
	/** Reads and writes of the user's dictionary run one at a time, in order. */
	private userDictQueue: Promise<void> = Promise.resolve();

	constructor(plugin: LangsoftPlugin) {
		this.plugin = plugin;
	}

	async init() {
		// let saves of the dictionary that was loaded before finish first
		await this.flush();
		this.userDict = {};
		this.userDictMtime = undefined;
		this.unreadableReason = null;
		this.legacyOwnMtime = undefined;
		this.otherDicts = {};
		this.coworkerMtimes = {};
		await this.getDictionaryFolder();
		await this.getAvailableDictionaries();
		await this.copyLegacyOwnIfMissing();
		await this.loadPrimaryDictionary();
		await this.mergeLegacyOwnIfChanged();
		await this.reloadOtherDictsIfChanged();
		// editors may have drawn their highlights before the dictionaries finished loading
		this.plugin.refreshHighlights();
	}

	/** Path of the current user's own dictionary. */
	userDictPath(): string {
		return normalizePath(`${this.dictFolder}/${this.plugin.currentUser}.json`);
	}

	private legacyOwnPath(): string | null {
		return this.legacyFolder ? normalizePath(`${this.legacyFolder}/${this.plugin.currentUser}.json`) : null;
	}

	/**
	 * Load coworkers' dictionaries that are new or changed since they were
	 * last read, and forget ones that were removed. A coworker with files in
	 * both the current and the old folder gets the two merged. Syncthing
	 * conflict copies are skipped.
	 */
	async reloadOtherDictsIfChanged() {
		this.reloadUserDictIfChanged();
		this.mergeLegacyOwnIfChanged();
		await this.getAvailableDictionaries();
		this.reportSyncConflicts();
		const adapter = this.plugin.app.vault.adapter;
		let changed = false;

		const groups = groupDictionaries([...this.availableDictionaries, ...this.legacyDictionaries]);
		groups.delete(this.plugin.currentUser);

		for (const [name, paths] of groups) {
			const stats = await Promise.all(paths.map((path) => adapter.stat(path)));
			const unchanged =
				name in this.otherDicts &&
				paths.every((path, i) => path in this.coworkerMtimes && stats[i]?.mtime === this.coworkerMtimes[path]);
			if (unchanged) continue;

			let combined: DictionaryData | null = null;
			for (const [i, path] of paths.entries()) {
				try {
					const result = parseDictionary<DictionaryData>(await adapter.read(path));
					if ("error" in result) throw new Error(result.error);
					combined = combined ? mergeDictionaries(combined, result.dict) : result.dict;
					// only remembered once the file has been read successfully, so a broken file is retried
					this.coworkerMtimes[path] = stats[i]?.mtime;
				} catch (e) {
					console.error(`Langsoft: could not load ${path}`, e);
				}
			}
			if (combined) {
				this.otherDicts[name] = combined;
				changed = true;
			}
		}

		// dictionaries whose files are gone
		for (const name of Object.keys(this.otherDicts)) {
			if (!groups.has(name)) {
				delete this.otherDicts[name];
				changed = true;
			}
		}
		const current = new Set(([] as string[]).concat(...groups.values()));
		for (const path of Object.keys(this.coworkerMtimes)) {
			if (!current.has(path)) delete this.coworkerMtimes[path];
		}

		if (changed) {
			this.plugin.refreshHighlights();
		}
	}

	/**
	 * First run after updating from a version that used the old folder: copy
	 * your dictionary from there into the current folder.
	 */
	private async copyLegacyOwnIfMissing() {
		const legacyPath = this.legacyOwnPath();
		if (!this.plugin.currentUser || !legacyPath) return;
		const adapter = this.plugin.app.vault.adapter;
		if ((await adapter.exists(this.userDictPath())) || !(await adapter.exists(legacyPath))) return;

		const text = await adapter.read(legacyPath);
		if ("error" in parseDictionary(text)) {
			console.warn(`Langsoft: not copying ${legacyPath}, it can't be read`);
			return;
		}
		await adapter.write(this.userDictPath(), text);
		this.availableDictionaries.push(this.userDictPath());
		new Notice(`Langsoft: copied your dictionary to the ${this.dictFolder} folder. The old copy in ${this.legacyFolder} is left as it was.`);
	}

	/**
	 * Merge in changes to your file in the old folder, e.g. from a device
	 * still on an older version, and save them in the current folder.
	 */
	mergeLegacyOwnIfChanged(): Promise<void> {
		return this.queueUserDictTask(async () => {
			const legacyPath = this.legacyOwnPath();
			if (!this.plugin.currentUser || !legacyPath || this.unreadableReason !== null) return;
			const adapter = this.plugin.app.vault.adapter;
			const stat = await adapter.stat(legacyPath);
			if (!stat || stat.mtime === this.legacyOwnMtime) return;
			if (!(await adapter.exists(this.userDictPath()))) return;

			const result = parseDictionary<DictionaryData>(await adapter.read(legacyPath));
			if ("error" in result) {
				console.warn(`Langsoft: not merging ${legacyPath}, it can't be read: ${result.error}`);
				return;
			}
			const before = JSON.stringify(this.userDict);
			this.userDict = mergeDictionaries(this.userDict, result.dict);
			this.legacyOwnMtime = stat.mtime;
			if (JSON.stringify(this.userDict) !== before) {
				await this.saveNow();
				this.plugin.refreshHighlights();
			}
		});
	}

	/** Tell the user, once per file, about conflict copies of their own dictionary. */
	private reportSyncConflicts() {
		const user = this.plugin.currentUser;
		for (const path of [...this.availableDictionaries, ...this.legacyDictionaries].filter(isSyncConflict)) {
			if (conflictOwner(path) !== user || this.reportedConflicts.has(path)) continue;
			this.reportedConflicts.add(path);
			new Notice(
				`Langsoft: Syncthing made a conflict copy of your dictionary:\n${dictionaryName(path)}\n\n` +
				"Words in it that are missing from your dictionary were not saved there. " +
				"The copy is ignored; it isn't shown as a coworker.",
				0
			);
		}
	}

	async getDictionaryFolder() {
		const dictName = this.plugin.settings.dictionaryFolder;
		const isDictFolder = await this.plugin.app.vault.adapter.exists(dictName, true);

		if (!isDictFolder) {
			try {
				await this.plugin.app.vault.adapter.mkdir(dictName);
			} catch (e) {
				console.log(e);
			}
		}
		this.dictFolder = dictName;
	}

	/** List the JSON files in the dictionary folder, and in the old folder while it exists. */
	async getAvailableDictionaries() {
		const adapter = this.plugin.app.vault.adapter;
		const jsonFiles = async (folder: string) =>
			(await adapter.list(folder)).files.filter((file: string) => file.endsWith(".json"));

		this.availableDictionaries = await jsonFiles(this.dictFolder);
		// only for the default folder: someone who chose their own folder has moved on from the old one
		const useLegacy = this.dictFolder === DEFAULT_FOLDER && (await adapter.exists(LEGACY_FOLDER));
		this.legacyFolder = useLegacy ? LEGACY_FOLDER : null;
		this.legacyDictionaries = useLegacy ? await jsonFiles(LEGACY_FOLDER) : [];
	}

	async loadPrimaryDictionary() {
		// the user's own dictionary (<user>.json); it must contain a JSON object, at least {}
		const path = this.userDictPath();
		if (!(await this.plugin.app.vault.adapter.exists(path))) return;
		const stat = await this.plugin.app.vault.adapter.stat(path);
		const result = parseDictionary<DictionaryData>(await this.plugin.app.vault.adapter.read(path));
		if ("error" in result) {
			this.markUnreadable(path, result.error);
			return;
		}
		this.userDict = result.dict;
		this.userDictMtime = stat?.mtime;
	}

	private markUnreadable(path: string, reason: string) {
		if (this.unreadableReason === null) {
			new Notice(
				`Langsoft: your dictionary ${path} can't be read (${reason}).\n\n` +
				"Your changes won't be saved until the file is fixed or restored, e.g. from Syncthing's file versions. " +
				"Langsoft notices when it is readable again.",
				0
			);
		}
		this.unreadableReason = reason;
	}

	/** Pick up changes another device synced to the user's own dictionary. */
	reloadUserDictIfChanged(): Promise<void> {
		return this.queueUserDictTask(async () => {
			const path = this.userDictPath();
			if (!this.plugin.currentUser || !(await this.plugin.app.vault.adapter.exists(path))) return;
			if ((await this.mergeChangesFromDisk(path)) === "merged") {
				this.plugin.refreshHighlights();
			}
		});
	}

	/**
	 * If the file was changed by someone else (e.g. Syncthing bringing in
	 * another device's edits) since it was last read or written, merge those
	 * changes into the dictionary in memory. A file that couldn't be read
	 * before is checked every time, so a fix is noticed.
	 */
	private async mergeChangesFromDisk(path: string): Promise<"unchanged" | "merged" | "unreadable"> {
		const stat = await this.plugin.app.vault.adapter.stat(path);
		if (!stat) return "unchanged";
		if (this.unreadableReason === null && stat.mtime === this.userDictMtime) return "unchanged";

		const result = parseDictionary<DictionaryData>(await this.plugin.app.vault.adapter.read(path));
		if ("error" in result) {
			this.markUnreadable(path, result.error);
			return "unreadable";
		}
		if (this.unreadableReason !== null) {
			this.unreadableReason = null;
			new Notice(`Langsoft: your dictionary ${path} can be read again, and changes are saved again.`);
		}
		this.userDict = mergeDictionaries(result.dict, this.userDict);
		this.userDictMtime = stat.mtime;
		return "merged";
	}

	/** Wait until every read and save of the user's dictionary started so far has finished. */
	flush(): Promise<void> {
		return this.userDictQueue;
	}

	private queueUserDictTask(task: () => Promise<void>): Promise<void> {
		this.userDictQueue = this.userDictQueue.then(task).catch((e) => {
			console.error("Langsoft: could not read or save your dictionary", e);
			new Notice(`Langsoft: could not save your dictionary: ${e}`);
		});
		return this.userDictQueue;
	}


	async loadWordnetDict() {
		const jsonPath = "dict-WordNet.json";
		if (await this.plugin.app.vault.adapter.exists(jsonPath)) {
			const wordnetFile = await this.plugin.app.vault.adapter.read(jsonPath)
			this.wordnet = JSON.parse(wordnetFile)

		}
	}

	writeHighlightChangeToJson(term: string, level: string) {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const entry = this.userDict[term.trim().toLowerCase()];
		if (entry) {
			entry.highlighthistory.push({ level: level, timestamp: timestamp })
			entry.highlight = level;
			this.writeUserDictToJson();
			this.plugin.refreshHighlights();
		}

	}


	addNewDefinition(term: string, level: string, defText: string, context: Definition) {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const sameTermFound = this.userDict[term];
		if (sameTermFound) { // just update the existing word / phrase
			// check if there is already a matching definition
			const sameDefFound = this.userDict[term].definitions[defText];
			if (sameDefFound) {
				if (!sameDefFound.deleted) {
					return; // don't do anything (in the future, I could display a toast message saying that the definition is already there)
				}
			}
			// add the new definition
			sameTermFound.definitions[defText] = context;
			// make sure the definerViewLeaf gets updated
			// const leaf = this.plugin.getDefinerViewLeaf()
			// leaf.addListItem(defText, context);
			// if the highlight was none (for example it was the undefined first word of a phrase) when we need to add 
			sameTermFound.highlight = level;
			sameTermFound.highlighthistory.push({ level: level, timestamp: timestamp });
			return;
		}
		// add new entry
		this.userDict[term] = {
			highlight: level,
			definitions: {},
			highlighthistory: [{ level: level, timestamp: timestamp }],
			firstwordofphrase: []
		}
		// add definition to new entry
		this.userDict[term].definitions[defText] = context;
		// if we are dealing with a phrase then we need to handle the first word reference (which is used to find and highlight phrases)
		const parts = this.plugin.parseIntoWords(term, 0)
		if (parts.length > 1) { // it's a phrase
			const firstWordOfPhrase = parts[0];
			if (this.userDict[firstWordOfPhrase.text]) { // if true, then there is already an entry for the first word
				for (const phrase of this.userDict[firstWordOfPhrase.text].firstwordofphrase) {
					if (phrase == term) { // the phrase is already referenced
						return;
					}
				}
				// add the reference to the existing first word:
				this.userDict[firstWordOfPhrase.text].firstwordofphrase.push(term);
			} else { // we need to add a blank first word entry
				this.userDict[firstWordOfPhrase.text] = {
					highlight: "None",
					definitions: {},
					highlighthistory: [{ level: "None", timestamp }],
					firstwordofphrase: [term]
				}
			}
		}
	}


	markDefinitionDeleted(term: string, definition: string) {
		try {
			this.userDict[term].definitions[definition].deleted = true;
			let otherDefinitionExists = false;
			for (const [key, val] of Object.entries(this.userDict[term].definitions)) {
				if (!val.deleted) {
					otherDefinitionExists = true;
				}
			}
			if (!otherDefinitionExists) {
				this.userDict[term].highlight = "None";
			}
			this.writeUserDictToJson();
			this.plugin.refreshHighlights()
		} catch {
			return;
		}
	}

	/**
	 * Save the user's dictionary. Changes another device made to the file
	 * since it was last read are merged in first rather than overwritten.
	 */
	writeUserDictToJson(): Promise<void> {
		return this.queueUserDictTask(() => this.saveNow());
	}

	/** Save right away. Only call from inside a queued task. */
	private async saveNow() {
		const path = this.userDictPath();
		// only write to a dictionary the user has set up, never create one under an empty or mistyped name
		if (!this.plugin.currentUser) {
			new Notice('Langsoft: this change was not saved because no user is chosen. Run the command "Langsoft: Switch user" to choose one.');
			return;
		}
		if (!(await this.plugin.app.vault.adapter.exists(path))) {
			new Notice(`Langsoft: this change was not saved because ${path} doesn't exist. Run the command "Langsoft: Switch user" to choose or create your user.`);
			return;
		}
		const status = await this.mergeChangesFromDisk(path);
		if (status === "unreadable") {
			new Notice(`Langsoft: this change was not saved because ${path} can't be read. Fix or restore the file first.`);
			return;
		}
		await this.plugin.app.vault.adapter.write(path, JSON.stringify(this.userDict));
		this.userDictMtime = (await this.plugin.app.vault.adapter.stat(path))?.mtime;
		if (status === "merged") {
			this.plugin.refreshHighlights();
		}
	}





}

