import LangsoftPlugin from "main";
import * as path from 'path';
import { MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { TriggerEffect } from "highlighter";

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
		// this.loadWordnetDict()
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
			this.plugin.refreshHighlights();
		}

	}


	isExistingWordOrPhrase(term: string) {
		const result = this.userDict[term.trim().toLowerCase()]
		if (result) {
			return true;
		} else {
			return false;
		}
	}

	addNewDefinition(term: string, level: string, definition: Definition) {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const sameTermFound = this.userDict[term];
		if (sameTermFound) { // just update the existing word / phrase
			// check if there is already a matching definition
			const definitions = sameTermFound.definitions
			for (const def of definitions) {
				if (def.definition == definition.definition) {
					console.log("you tried to save: ", definition, " but there was already the def: ", def)
					return; // don't do anything (in the future, I could display a toast message saying that the definition is already there)
				}
			}

			// add the new definition
			sameTermFound.definitions.push(definition);
			// make sure the definerViewLeaf gets updated
			const leaf = this.plugin.getDefinerViewLeaf()
			leaf.addListItem(definition.definition, definition.firstcontext);

			// if the highlight was none (for example it was the undefined first word of a phrase) when we need to add 
			sameTermFound.highlight = level;
			sameTermFound.highlighthistory.push({ level: level, timestamp: timestamp });

			return;
		}
		// add new entry
		this.userDict[term] = {
			highlight: level,
			deleted: false,
			definitions: [definition],
			deleteddefinitions: [],
			highlighthistory: [{ level: level, timestamp: timestamp }],
			firstwordofphrase: []
		}
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
					deleted: false,
					definitions: [],
					deleteddefinitions: [],
					highlighthistory: [],
					firstwordofphrase: [term]
				}
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

