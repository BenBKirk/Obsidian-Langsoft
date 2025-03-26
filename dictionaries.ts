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

		// for (const item of this.wordnet) {
		// 	if (item.Term === searchTerm.toLowerCase()) {
		// 		return item.Definition;
		// 	}
		// }

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



	// findMostRecentContextDefinition(definition: Definition): Context {
	// 	let latestContext = null;
	// 	let latestTimestamp = null;
	//
	// 	// for (const term of data) {
	// 	// 	if (term.deleted) continue;
	//
	// 	// for (const definition of term.definitions) {
	// 	// 	if (definition.deleted) continue;
	//
	// 	for (const context of definition.contexts) {
	// 		const currentTimestamp = moment(context.timestamp, "YYYY-MM-DD HH:mm:ss");
	//
	// 		if (!latestTimestamp || currentTimestamp.isAfter(latestTimestamp)) {
	// 			latestTimestamp = currentTimestamp;
	// 			latestContext = context;
	// 		}
	// 	}
	// 	// }
	// 	// }
	//
	// 	// return latestContext;
	// 	return latestContext ?? {
	// 		level: "unknown",
	// 		timestamp: "1970-01-01 00:00:00", // Default old timestamp
	// 		file: "default.md",
	// 		sentence: "No context available."
	// 	};
	//
	// }
	async loadWordnetDict() {
		const jsonPath = "dict-WordNet.json";
		if (await this.plugin.app.vault.adapter.exists(jsonPath)) {
			const wordnetFile = await this.plugin.app.vault.adapter.read(jsonPath)
			this.wordnet = JSON.parse(wordnetFile)

		}
	}






}

