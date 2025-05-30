import { Highlighter } from "highlighter";
import LangsoftPlugin from "main";
import * as path from 'path';


export interface Context {
	timestamp: string;
	file: string;
	sentence: string;
}

export interface Definition {
	definition: string;
	deleted: boolean;
	firstcontext: Context;
}

export interface Level {
	level: string;
	timestamp: string;
}

// a list of entries makes up a dictionary
export interface Entry {
	term: string;
	deleted: boolean;
	highlights: Level[];
	definitions: Definition[];
}

export interface Dictionary {
	entry: Entry[];
}
// a bookself can hold more than one dictionary (useful for holding coworkers dictionaries)
export interface Bookshelf {
	dictionary: Dictionary[];
}



export class DictionaryManager {
	plugin: LangsoftPlugin;
	userDict: Entry[];
	coworkersDict: Bookshelf;
	dictFolder: string;
	availableDictionaries: string[];
	wordnet: string;

	constructor(plugin: LangsoftPlugin) {
		this.plugin = plugin;
		this.loadWordnetDict()
		this.init();
	}

	async init() {
		//check dictionary folder exists
		//
		await this.getDictionaryFolder();
		await this.getAvailableDictionaries();
		await this.loadPrimaryDictionary();
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
		//check if primary dictionary exists (<user>.json)
		const primaryDict = this.plugin.settings.user + ".json";
		const primaryDictFullPath: string = path.join(this.dictFolder, primaryDict).toString();

		if (this.availableDictionaries.includes(primaryDictFullPath)) {

			const dict = await this.plugin.app.vault.adapter.read(primaryDictFullPath);
			// load into memory
			// this.userDict = JSON.parse(dict);
			if (dict) {
				this.userDict = JSON.parse(dict);
			}

		} else {
			//need to create a dict
			try {
				console.log("creating new empty dictionary: ", primaryDictFullPath)
				await this.plugin.app.vault.adapter.write(primaryDictFullPath, "[]")
				this.userDict = [];
			} catch (e) {
				console.log(e)
			}
		}
	}

	async searchUserDict(searchTerm: string) {
		if (!searchTerm) {
			return false;
		}
		if (this.userDict.length < 1) {
			return false;
		}

		for (const entry of this.userDict) {
			if (entry.term.toLowerCase() === searchTerm.toLowerCase()) {
				return entry;
			}
		}
	}

	findMostRecentHighlightLevel(entry: Entry) {
		let latestLevel = "unknown";
		let latestTimestamp = null;
		for (const hl of entry.highlights) {
			const currentTimestamp = moment(hl.timestamp, "YYYY-MM-DD HH:mm:ss");
			if (!latestTimestamp || currentTimestamp.isAfter(latestTimestamp)) {
				latestTimestamp = currentTimestamp;
				latestLevel = hl.level;
			}
		}
		return latestLevel;
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
		for (const entry of this.userDict) {
			if (entry.term.trim().toLowerCase() === term.trim().toLowerCase()) {
				entry.highlights.push({ level: level, timestamp });
			}
		}
		this.writeUserDictToJson();

	}

	writeNewDefinitionToJson(term: string, level: string, definition: Definition) {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		for (const entry of this.userDict) {
			// update if already in userDict
			if (entry.term.trim().toLowerCase() === term.trim().toLowerCase()) {
				entry.highlights.push({ level: level, timestamp: timestamp });
				entry.definitions.push(definition);
				entry.deleted = false;
				this.writeUserDictToJson();
				return;
			}
		}
		this.userDict.push({ term: term, deleted: false, highlights: [{ level: level, timestamp: timestamp }], definitions: [definition] })
		this.writeUserDictToJson();
	}

	markDefinitionDeleted(term: string, definition: string) {
		let isOtherDefFlag = false;
		for (const entry of this.userDict) {
			if (entry.term.trim().toLowerCase() === term.trim().toLowerCase()) {
				for (const def of entry.definitions) {

					if (def.definition.trim().toLowerCase() === definition.trim().toLowerCase()) {
						def.deleted = true;
					}
					if (!def.deleted) {
						isOtherDefFlag = true;
					}
				}
				if (isOtherDefFlag) {
					this.writeUserDictToJson();
				} else {
					entry.deleted = true;
					this.writeUserDictToJson();
				}
			}
		}
	}
	// if (entry.definitions.length === 0) {
	// 	entry.deleted = true;
	// 	entry.definitions[0].deleted = true;
	// 	this.writeUserDictToJson();

	writeUserDictToJson() {
		const primaryDict = this.plugin.settings.user + ".json";
		const primaryDictFullPath: string = path.join(this.dictFolder, primaryDict).toString();

		if (this.availableDictionaries.includes(primaryDictFullPath)) {
			this.plugin.app.vault.adapter.write(primaryDictFullPath, JSON.stringify(this.userDict));
		}
	}





}

