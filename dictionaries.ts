import LangsoftPlugin from "main";
import { moment, normalizePath } from "obsidian";


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
	lastLoadedModifiedDate: (number | undefined)[];

	constructor(plugin: LangsoftPlugin) {
		this.plugin = plugin;
		// this.loadWordnetDict()
		this.init();
	}

	async init() {
		//check dictionary folder exists
		//
		this.otherDicts = {};
		this.lastLoadedModifiedDate = [];
		await this.getDictionaryFolder();
		await this.getAvailableDictionaries();
		await this.loadPrimaryDictionary();
		await this.loadSecondaryDictionaries();
		// editors may have drawn their highlights before the dictionaries finished loading
		this.plugin.refreshHighlights();
	}

	async reloadOtherDictsIfChanged() {
		const primaryDict = this.plugin.settings.currentUser + ".json";
		// const primaryDictFullPath: string = path.join(this.dictFolder, primaryDict).toString();
		const primaryDictFullPath = normalizePath(`${this.dictFolder}/${primaryDict}`);
		console.log(primaryDictFullPath)

		let count = 0
		let changed = false;
		for (const path of this.availableDictionaries.filter(val => val !== primaryDictFullPath)) {
			// console.log(path);
			try {
				// record the modified time of other dictionaries (so that we know if they need reloading)
				const stat = await this.plugin.app.vault.adapter.stat(path);

				// only load if the time modified date has changed since last opened
				if (stat?.mtime !== this.lastLoadedModifiedDate[count]) {
					const dict = await this.plugin.app.vault.adapter.read(path);
					const parsedDict = JSON.parse(dict);
					console.log("reloading ", path.slice(23, -5))
					this.otherDicts[path.slice(23, -5)] = parsedDict;
					//update the last seen modified date
					this.lastLoadedModifiedDate[count] = stat?.mtime;
					changed = true;
				}
				count += 1
			} catch (e) {
				console.log(e)

			}

		}
		if (changed) {
			this.plugin.refreshHighlights();
		}
	}

	async getDictionaryFolder() {
		const dictName = this.plugin.settings.dictionaryFolder;
		const isDictFolder = await this.plugin.app.vault.adapter.exists(dictName, true);

		if (!isDictFolder) {
			try {
				this.plugin.app.vault.adapter.mkdir(dictName);
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
		//check if primary dictionary exists (<user>.json) it also need to be a json object not a blank file (at least {})

		const primaryDict = this.plugin.settings.currentUser + ".json";
		const primaryDictFullPath = normalizePath(`${this.dictFolder}/${primaryDict}`);
		if (this.availableDictionaries.includes(primaryDictFullPath)) {
			const dict = await this.plugin.app.vault.adapter.read(primaryDictFullPath);
			if (dict) {
				this.userDict = JSON.parse(dict);
			}

		}
	}

	async loadSecondaryDictionaries() {
		const primaryDict = this.plugin.settings.currentUser + ".json";
		const primaryDictFullPath = normalizePath(`${this.dictFolder}/${primaryDict}`);
		let count = 0
		for (const path of this.availableDictionaries.filter(val => val !== primaryDictFullPath)) {
			// console.log(path);
			try {
				// record the modified time of other dictionaries (so that we know if they need reloading)
				const stat = await this.plugin.app.vault.adapter.stat(path);
				this.lastLoadedModifiedDate[count] = stat?.mtime;
				count += 1

				const dict = await this.plugin.app.vault.adapter.read(path);
				// console.log(dict)
				const parsedDict = JSON.parse(dict);
				// console.log(parsedDict);

				// this.otherDicts.push(parsedDict);
				this.otherDicts[path.slice(23, -5)] = parsedDict;

			} catch (e) {
				console.log(e)

			}

		}
		// console.log(this.lastModifiedDate)

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

	writeUserDictToJson() {
		const primaryDict = this.plugin.settings.currentUser + ".json";
		const primaryDictFullPath = normalizePath(`${this.dictFolder}/${primaryDict}`);

		if (this.availableDictionaries.includes(primaryDictFullPath)) {
			this.plugin.app.vault.adapter.write(primaryDictFullPath, JSON.stringify(this.userDict));
		}
	}





}

