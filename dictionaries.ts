import { Highlighter } from "highlighter";
import LangsoftPlugin from "main";
import * as path from 'path';

// Interface for the context of a definition
interface Context {
	timestamp: string;
	file: string;
	surroundingtext: string;
}

// Interface for a definition
interface Definition {
	definition: string;
	firstcontext: Context;
}

// Interface for highlight history
interface HighlightHistory {
	level: string;
	timestamp: string;
}

// Main interface for the word data
interface WordEntry {
	highlight: string;
	deleted: boolean;
	definitions: Definition[];
	deleteddefinitions: Definition[];
	highlighthistory: HighlightHistory[];
	firstwordofphrase: string[];
}

// Type for the dictionary mapping words to their data
// type WordDictionary = Map<string, WordData>;
type WordMap = Record<string, WordEntry>;


export class DictionaryManager {
	plugin: LangsoftPlugin;
	userDict: WordMap;
	// coworkersDict: Bookshelf;
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
				// Parse JSON with proper typing
				// const jsonObject = JSON.parse(dict) as Record<string, WordData>;
				this.userDict = JSON.parse(dict);

				// Convert to a Map<string, WordData>
				// this.userDict = new Map(jsonObject.entries());
				// this.userDict = new Map<string, WordData>(jsonObject.entries());
				// const hashMap = new Map<string, any>(Object.entries(jsonObject));
			}

		}
		//else {
		//need to create a dict
		// try {
		// 	console.log("creating new empty dictionary: ", primaryDictFullPath)
		// 	await this.plugin.app.vault.adapter.write(primaryDictFullPath, "[]")
		// 	this.userDict = WordMap[];
		// } catch (e) {
		// 	console.log(e)
		// }
	}

	// async searchUserDict(searchTerm: string) {
	// if (!searchTerm) {
	// 	return false;
	// }
	// if (this.userDict.length < 1) {
	// 	return false;
	// }
	//
	// for (const entry of this.userDict) {
	// 	if (entry.term.toLowerCase() === searchTerm.toLowerCase()) {
	// 		return entry;
	// 	}
	// }
	// }

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
		const entry = this.userDict[term.trim().toLowerCase()];
		if (entry) {
			entry.highlighthistory.push({ level: level, timestamp: timestamp })
			entry.highlight = level;
			this.writeUserDictToJson();
		}

	}

	writeNewDefinitionToJson(term: string, level: string, definition: Definition) {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const entry = this.userDict[term.trim().toLowerCase()]
		if (entry) {
			entry.highlighthistory.push({ level: level, timestamp: timestamp });
			entry.definitions.push(definition);
			this.writeUserDictToJson();
		} else { // if there is not entry for that word / phrase yet create a new one
			// check if it is a phrase
			const regex = /\b\w+\b/g;
			const parts = term.match(regex);
			console.log(term)
			console.log(parts)
			if (parts?.length > 1) { // it's a phrase
				console.log("it's a phrase");
				const firstwordofphrase = parts[0];
				const existingWord = this.userDict[firstwordofphrase];
				if (existingWord) {
					existingWord.highlighthistory.push({ level: level, timestamp: timestamp });
					existingWord.definitions.push(definition);
					this.writeUserDictToJson();
				} else {
					this.userDict[parts.join(" ").trim().toLowerCase()] = {
						highlight: level,
						deleted: false,
						definitions: [definition],
						deleteddefinitions: [],
						highlighthistory: [{ level: level, timestamp: timestamp }],
						firstwordofphrase: []
					}
					this.writeUserDictToJson();
				}

			} else {
				this.userDict[parts[0].trim().toLowerCase()] = {
					highlight: level,
					deleted: false,
					definitions: [definition],
					deleteddefinitions: [],
					highlighthistory: [{ level: level, timestamp: timestamp }],
					firstwordofphrase: []
				}
				this.writeUserDictToJson();

			}
		}
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

