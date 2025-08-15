import LangsoftPlugin from "main";
import * as path from 'path';
import { MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { TriggerEffect } from "highlighter";


interface Definition {
	deleted: boolean;
	timestamp: string; // Could use Date if you plan to parse it
	file: string;
	surroundingtext: string;
}

interface HighlightHistoryEntry {
	level: string; // Could also be an enum like 'unknown' | 'semi-known' | 'known'
	timestamp: string;
}

interface WordEntry {
	highlight: string; // Could be 'known' | 'unknown' | etc.
	definitions: Record<string, Definition>; // Key is the definition name (e.g., "husband")
	highlighthistory: HighlightHistoryEntry[];
	firstwordofphrase: string[];
}

type DictionaryData = Record<string, WordEntry>;


export class DictionaryManager {
	plugin: LangsoftPlugin;
	// userDict: WordMap;
	userDict: DictionaryData;
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
			if (dict) {
				this.userDict = JSON.parse(dict);
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
		const entry = this.userDict[term.trim().toLowerCase()];
		if (entry) {
			entry.highlighthistory.push({ level: level, timestamp: timestamp })
			entry.highlight = level;
			this.writeUserDictToJson();
			this.plugin.refreshHighlights();
		}

	}


	addNewDefinition(term: string, level: string, defKey: string, context: Definition) {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const sameTermFound = this.userDict[term];
		if (sameTermFound) { // just update the existing word / phrase
			// check if there is already a matching definition
			const sameDefFound = this.userDict[term].definitions[defKey];
			if (sameDefFound) {
				if (!sameDefFound.deleted) {
					return; // don't do anything (in the future, I could display a toast message saying that the definition is already there)
				}
			}

			// add the new definition
			sameTermFound.definitions[defKey] = context;
			// make sure the definerViewLeaf gets updated
			const leaf = this.plugin.getDefinerViewLeaf()
			leaf.addListItem(defKey, context);

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
		this.userDict[term].definitions[defKey] = context;
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
		console.log(term)
		console.log(definition)

		try {
			this.userDict[term].definitions[definition].deleted = true;
			console.log("deleted!")
			// TODO 
			// should check if other definition exist. if not, then change the highlight to None.
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
		const primaryDict = this.plugin.settings.user + ".json";
		const primaryDictFullPath: string = path.join(this.dictFolder, primaryDict).toString();

		if (this.availableDictionaries.includes(primaryDictFullPath)) {
			this.plugin.app.vault.adapter.write(primaryDictFullPath, JSON.stringify(this.userDict));
		}
	}





}

