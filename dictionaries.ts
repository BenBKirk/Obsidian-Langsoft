import type LangsoftPlugin from "main";
import { moment, normalizePath, Notice } from "obsidian";
import {
	classifyDictionaryPath,
	DEFAULT_FOLDER,
	DictionarySource,
	LEGACY_FOLDER,
	parseDeviceFile,
	parseSource,
	serializeDeviceFile,
} from "dictionary-files";
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
	/** The current user's dictionary: all of their files, merged. */
	userDict: DictionaryData = {};
	/** Everyone else's dictionaries, by user, each merged from all of their files. */
	otherDicts: BookShelf = {};
	dictFolder: string;
	/**
	 * The folder dictionaries were kept in before version 1.2, while it still
	 * exists and the default folder is used. Read, never written.
	 */
	legacyFolder: string | null = null;
	/** Every dictionary file found in the last scan. */
	sources: DictionarySource[] = [];
	/** Folders in the dictionary folder; each is a user, even before it has a file. */
	private userFolders: string[] = [];
	wordnet: string;

	/** Modification time of the current user's other files when they were last merged in, by path. */
	private ownSourceMtimes: Record<string, number | undefined> = {};
	/** Modification time of each coworker file when it was last read, by path. */
	private coworkerMtimes: Record<string, number | undefined> = {};
	/** Files already mentioned in a notice, so each is only mentioned once. */
	private reportedConflicts = new Set<string>();
	private reportedUnreadable = new Set<string>();

	/** Modification time of this device's file when it was last read or written. */
	private deviceFileMtime: number | undefined;
	/**
	 * Why this device's file couldn't be read, or null if it could. While it
	 * can't be read, it is never written: that would replace it with only
	 * what is in memory.
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
		this.deviceFileMtime = undefined;
		this.unreadableReason = null;
		this.ownSourceMtimes = {};
		this.otherDicts = {};
		this.coworkerMtimes = {};
		await this.getDictionaryFolder();
		await this.scanSources();
		await this.queueUserDictTask(() => this.loadOwn());
		await this.reloadOtherDictsIfChanged();
		// editors may have drawn their highlights before the dictionaries finished loading
		this.plugin.refreshHighlights();
	}

	userFolderPath(user = this.plugin.currentUser): string {
		return normalizePath(`${this.dictFolder}/${user}`);
	}

	/** This device's file for a user: the only dictionary file this device ever writes. */
	deviceFilePath(user = this.plugin.currentUser): string {
		return normalizePath(`${this.dictFolder}/${user}/${this.plugin.deviceId}.json`);
	}

	/** Users that have a dictionary, sorted. */
	listUsers(): string[] {
		const users = new Set([...this.userFolders, ...this.sources.filter((s) => !s.conflict).map((s) => s.user)]);
		return [...users].sort((a, b) => a.localeCompare(b));
	}

	/** Find every dictionary file: in users' folders, the 1.2 layout and the pre-1.2 folder. */
	async scanSources() {
		const adapter = this.plugin.app.vault.adapter;
		const folder = this.dictFolder;
		// only for the default folder: someone who chose their own folder has moved on from the old one
		const useLegacy = folder === DEFAULT_FOLDER && (await adapter.exists(LEGACY_FOLDER));
		this.legacyFolder = useLegacy ? LEGACY_FOLDER : null;

		const top = await adapter.list(folder);
		const paths = [...top.files];
		const userFolders: string[] = [];
		for (const sub of top.folders) {
			const name = sub.slice(sub.lastIndexOf("/") + 1);
			// skip hidden folders, e.g. Syncthing's .stversions
			if (!name || name.startsWith(".")) continue;
			userFolders.push(name);
			paths.push(...(await adapter.list(sub)).files);
		}
		if (useLegacy) {
			paths.push(...(await adapter.list(LEGACY_FOLDER)).files);
		}
		this.userFolders = userFolders;
		this.sources = paths
			.map((path) => classifyDictionaryPath(path, folder, this.legacyFolder))
			.filter((source): source is DictionarySource => source !== null);
	}

	/** Create a new user: their folder, and an empty file for this device so other devices see them. */
	async createUser(name: string) {
		await this.getDictionaryFolder();
		const adapter = this.plugin.app.vault.adapter;
		if (!(await adapter.exists(this.userFolderPath(name)))) {
			await adapter.mkdir(this.userFolderPath(name));
		}
		if (!(await adapter.exists(this.deviceFilePath(name)))) {
			await adapter.write(this.deviceFilePath(name), serializeDeviceFile({}));
		}
		await this.scanSources();
	}

	/**
	 * Load coworkers' dictionaries that are new or changed since they were
	 * last read, and forget ones that were removed. Each coworker's files
	 * (devices, older layouts, conflict copies) are merged.
	 */
	async reloadOtherDictsIfChanged() {
		await this.scanSources();
		this.reportSyncConflicts();
		this.reloadUserDictIfChanged();
		const adapter = this.plugin.app.vault.adapter;
		let changed = false;

		const groups = new Map<string, DictionarySource[]>();
		for (const source of this.sources) {
			if (source.user === this.plugin.currentUser) continue;
			groups.set(source.user, [...(groups.get(source.user) ?? []), source]);
		}

		for (const [name, sources] of groups) {
			const stats = await Promise.all(sources.map((source) => adapter.stat(source.path)));
			const unchanged =
				name in this.otherDicts &&
				sources.every(({ path }, i) => path in this.coworkerMtimes && stats[i]?.mtime === this.coworkerMtimes[path]);
			if (unchanged) continue;

			let combined: DictionaryData | null = null;
			for (const [i, source] of sources.entries()) {
				try {
					const result = parseSource<DictionaryData>(source, await adapter.read(source.path));
					if ("error" in result) throw new Error(result.error);
					combined = combined ? mergeDictionaries(combined, result.dict) : result.dict;
					// only remembered once the file has been read successfully, so a broken file is retried
					this.coworkerMtimes[source.path] = stats[i]?.mtime;
				} catch (e) {
					console.error(`Langsoft: could not load ${source.path}`, e);
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
		const current = new Set(this.sources.map((source) => source.path));
		for (const path of Object.keys(this.coworkerMtimes)) {
			if (!current.has(path)) delete this.coworkerMtimes[path];
		}

		if (changed) {
			this.plugin.refreshHighlights();
		}
	}

	/** Tell the user, once per file, about conflict copies of their own dictionary. */
	private reportSyncConflicts() {
		const user = this.plugin.currentUser;
		for (const source of this.sources) {
			if (!source.conflict || source.user !== user || this.reportedConflicts.has(source.path)) continue;
			this.reportedConflicts.add(source.path);
			new Notice(
				`Langsoft: found a Syncthing conflict copy of your dictionary:\n${source.path}\n\n` +
				"Its words have been merged into your dictionary. Once you've checked nothing is missing, you can delete the copy."
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

	/**
	 * Load the current user's dictionary: this device's file, with all their
	 * other files merged in. Only call from a queued task.
	 */
	private async loadOwn() {
		if (!this.plugin.currentUser) return;
		const adapter = this.plugin.app.vault.adapter;
		const path = this.deviceFilePath();
		if (await adapter.exists(path)) {
			const stat = await adapter.stat(path);
			const result = parseDeviceFile<DictionaryData>(await adapter.read(path));
			if ("error" in result) {
				this.markUnreadable(path, result.error);
				return;
			}
			this.userDict = result.dict;
			this.deviceFileMtime = stat?.mtime;
		}
		await this.mergeOwnSourcesIfChanged();
	}

	/**
	 * Merge in the current user's other files that changed since they were
	 * last merged: other devices' files, files from older versions and
	 * conflict copies. Saves this device's file if that added anything.
	 * Only call from a queued task.
	 */
	private async mergeOwnSourcesIfChanged(): Promise<boolean> {
		const user = this.plugin.currentUser;
		if (!user || this.unreadableReason !== null) return false;
		const adapter = this.plugin.app.vault.adapter;
		const ownPath = this.deviceFilePath();
		const firstTime = !(await adapter.exists(ownPath));
		const before = JSON.stringify(this.userDict);

		for (const source of this.sources) {
			if (source.user !== user || source.path === ownPath) continue;
			const stat = await adapter.stat(source.path);
			if (!stat || stat.mtime === this.ownSourceMtimes[source.path]) continue;
			const result = parseSource<DictionaryData>(source, await adapter.read(source.path));
			if ("error" in result) {
				if (!this.reportedUnreadable.has(source.path)) {
					this.reportedUnreadable.add(source.path);
					new Notice(`Langsoft: ${source.path} can't be read (${result.error}). Its words are left out until it is fixed.`, 0);
				}
				continue;
			}
			this.reportedUnreadable.delete(source.path);
			this.userDict = mergeDictionaries(this.userDict, result.dict);
			this.ownSourceMtimes[source.path] = stat.mtime;
		}

		if (JSON.stringify(this.userDict) === before) return false;
		await this.saveNow();
		if (firstTime && (await adapter.exists(ownPath))) {
			new Notice(`Langsoft: your dictionary is now saved on this device as ${ownPath}. Your other files were merged in and left as they were.`);
		}
		return true;
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

	/** Pick up changes to the current user's files, e.g. synced from their other devices. */
	reloadUserDictIfChanged(): Promise<void> {
		return this.queueUserDictTask(async () => {
			if (!this.plugin.currentUser) return;
			let changed = false;
			if (await this.plugin.app.vault.adapter.exists(this.deviceFilePath())) {
				changed = (await this.mergeChangesFromDisk(this.deviceFilePath())) === "merged";
			}
			changed = (await this.mergeOwnSourcesIfChanged()) || changed;
			if (changed) {
				this.plugin.refreshHighlights();
			}
		});
	}

	/**
	 * If this device's file was changed by something else (e.g. edited by
	 * hand or restored from a backup) since it was last read or written,
	 * merge that into the dictionary in memory. A file that couldn't be read
	 * before is checked every time, so a fix is noticed.
	 */
	private async mergeChangesFromDisk(path: string): Promise<"unchanged" | "merged" | "unreadable"> {
		const stat = await this.plugin.app.vault.adapter.stat(path);
		if (!stat) return "unchanged";
		if (this.unreadableReason === null && stat.mtime === this.deviceFileMtime) return "unchanged";

		const result = parseDeviceFile<DictionaryData>(await this.plugin.app.vault.adapter.read(path));
		if ("error" in result) {
			this.markUnreadable(path, result.error);
			return "unreadable";
		}
		const wasUnreadable = this.unreadableReason !== null;
		this.unreadableReason = null;
		this.userDict = mergeDictionaries(result.dict, this.userDict);
		this.deviceFileMtime = stat.mtime;
		if (wasUnreadable) {
			new Notice(`Langsoft: your dictionary ${path} can be read again, and changes are saved again.`);
			// files that couldn't be merged while it was unreadable
			await this.mergeOwnSourcesIfChanged();
		}
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
				// record when the word was removed, so progress statistics can place it in time
				const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
				this.userDict[term].highlighthistory.push({ level: "None", timestamp });
			}
			this.writeUserDictToJson();
			this.plugin.refreshHighlights()
		} catch {
			return;
		}
	}

	/** Save the user's dictionary to this device's file. */
	writeUserDictToJson(): Promise<void> {
		return this.queueUserDictTask(() => this.saveNow());
	}

	/** Save right away. Only call from inside a queued task. */
	private async saveNow() {
		const user = this.plugin.currentUser;
		if (!user) {
			new Notice('Langsoft: this change was not saved because no user is chosen. Run the command "Langsoft: Switch user" to choose one.');
			return;
		}
		// never create a dictionary under an empty or mistyped name
		if (!this.listUsers().includes(user)) {
			new Notice(`Langsoft: this change was not saved because there is no dictionary for "${user}". Run the command "Langsoft: Switch user" to choose or create your user.`);
			return;
		}
		const adapter = this.plugin.app.vault.adapter;
		const path = this.deviceFilePath();
		let status: "unchanged" | "merged" | "unreadable" = "unchanged";
		if (await adapter.exists(path)) {
			status = await this.mergeChangesFromDisk(path);
			if (status === "unreadable") {
				new Notice(`Langsoft: this change was not saved because ${path} can't be read. Fix or restore the file first.`);
				return;
			}
		}
		if (!(await adapter.exists(this.userFolderPath()))) {
			await adapter.mkdir(this.userFolderPath());
			this.userFolders.push(user);
		}
		await adapter.write(path, serializeDeviceFile(this.userDict));
		this.deviceFileMtime = (await adapter.stat(path))?.mtime;
		if (status === "merged") {
			this.plugin.refreshHighlights();
		}
	}
}

