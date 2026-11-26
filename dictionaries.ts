import type LangsoftPlugin from "main";
import { moment, normalizePath, Notice } from "obsidian";
import { conflictOwner, dictionaryName, isSyncConflict } from "dictionary-files";
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
	availableDictionaries: string[];
	wordnet: string;
	/** Modification time of each coworker dictionary when it was last read, by path. */
	private coworkerMtimes: Record<string, number | undefined> = {};
	/** Conflict copies already reported in a notice, so each is only mentioned once. */
	private reportedConflicts = new Set<string>();

	/** Modification time of the user's own dictionary when it was last read or written. */
	private userDictMtime: number | undefined;
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
		this.otherDicts = {};
		this.coworkerMtimes = {};
		await this.getDictionaryFolder();
		await this.loadPrimaryDictionary();
		await this.reloadOtherDictsIfChanged();
		// editors may have drawn their highlights before the dictionaries finished loading
		this.plugin.refreshHighlights();
	}

	/** Path of the current user's own dictionary. */
	userDictPath(): string {
		return normalizePath(`${this.dictFolder}/${this.plugin.currentUser}.json`);
	}

	/**
	 * Load coworkers' dictionaries that are new or changed since they were
	 * last read, and forget ones that were removed. Syncthing conflict
	 * copies are skipped.
	 */
	async reloadOtherDictsIfChanged() {
		this.reloadUserDictIfChanged();
		await this.getAvailableDictionaries();
		const ownPath = this.userDictPath();
		let changed = false;

		const coworkerPaths = this.availableDictionaries.filter((path) => path !== ownPath && !isSyncConflict(path));
		this.reportSyncConflicts();

		for (const path of coworkerPaths) {
			try {
				const stat = await this.plugin.app.vault.adapter.stat(path);
				if (path in this.coworkerMtimes && stat?.mtime === this.coworkerMtimes[path]) continue;

				const dict = JSON.parse(await this.plugin.app.vault.adapter.read(path));
				this.otherDicts[dictionaryName(path)] = dict;
				// only remembered once the file has been read successfully, so a broken file is retried
				this.coworkerMtimes[path] = stat?.mtime;
				changed = true;
			} catch (e) {
				console.error(`Langsoft: could not load ${path}`, e);
			}
		}

		// dictionaries whose file is gone
		const current = new Set(coworkerPaths.map(dictionaryName));
		for (const name of Object.keys(this.otherDicts)) {
			if (!current.has(name)) {
				delete this.otherDicts[name];
				changed = true;
			}
		}
		for (const path of Object.keys(this.coworkerMtimes)) {
			if (!coworkerPaths.includes(path)) delete this.coworkerMtimes[path];
		}

		if (changed) {
			this.plugin.refreshHighlights();
		}
	}

	/** Tell the user, once per file, about conflict copies of their own dictionary. */
	private reportSyncConflicts() {
		const user = this.plugin.currentUser;
		for (const path of this.availableDictionaries.filter(isSyncConflict)) {
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

	async getAvailableDictionaries() {
		//get a list of JSON dictionaries in folder
		const allFilesInFolder = await this.plugin.app.vault.adapter.list(this.dictFolder);
		const jsonFiles = allFilesInFolder.files.filter((file: string) => file.endsWith(".json"));
		this.availableDictionaries = jsonFiles;
	}

	async loadPrimaryDictionary() {
		// the user's own dictionary (<user>.json); it must contain a JSON object, at least {}
		const path = this.userDictPath();
		if (!(await this.plugin.app.vault.adapter.exists(path))) return;
		const stat = await this.plugin.app.vault.adapter.stat(path);
		const dict = await this.plugin.app.vault.adapter.read(path);
		if (dict) {
			this.userDict = JSON.parse(dict);
		}
		this.userDictMtime = stat?.mtime;
	}

	/** Pick up changes another device synced to the user's own dictionary. */
	reloadUserDictIfChanged(): Promise<void> {
		return this.queueUserDictTask(async () => {
			const path = this.userDictPath();
			if (!this.plugin.currentUser || !(await this.plugin.app.vault.adapter.exists(path))) return;
			if (await this.mergeChangesFromDisk(path)) {
				this.plugin.refreshHighlights();
			}
		});
	}

	/**
	 * If the file was changed by someone else (e.g. Syncthing bringing in
	 * another device's edits) since it was last read or written, merge those
	 * changes into the dictionary in memory. Returns true if it did.
	 */
	private async mergeChangesFromDisk(path: string): Promise<boolean> {
		const stat = await this.plugin.app.vault.adapter.stat(path);
		if (!stat || stat.mtime === this.userDictMtime) return false;

		const text = await this.plugin.app.vault.adapter.read(path);
		let onDisk: DictionaryData;
		try {
			onDisk = text ? JSON.parse(text) : {};
		} catch (e) {
			// e.g. a half-written file; what is in memory is the best copy we have
			console.warn(`Langsoft: ${path} is not valid JSON, not merging it`, e);
			return false;
		}
		this.userDict = mergeDictionaries(onDisk, this.userDict);
		this.userDictMtime = stat.mtime;
		return true;
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
		return this.queueUserDictTask(async () => {
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
			const merged = await this.mergeChangesFromDisk(path);
			await this.plugin.app.vault.adapter.write(path, JSON.stringify(this.userDict));
			this.userDictMtime = (await this.plugin.app.vault.adapter.stat(path))?.mtime;
			if (merged) {
				this.plugin.refreshHighlights();
			}
		});
	}





}

