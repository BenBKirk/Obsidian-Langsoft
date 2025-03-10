import LangsoftPlugin from "main";
import { DecorationSpec, WordPositions } from "syntaxHighlight";
import * as path from 'path';
import { EditorView } from "@codemirror/view";
import { buildHighlightPlugin } from "viewPlugin";

interface Context {
	Level: string;
	TimeStamp: Date;
	File: string;
	Sentence: string;
}

interface Definition {
	Definition: string;
	Contexts: Context[];
}

interface Term {
	Term: string;
	Definitions: Definition[];
}


interface Definition {
	SearchTerm: string,
	Term: string,
	Definition: string
}


export class DictionaryManager {
	plugin: LangsoftPlugin;
	wordnet: Definition[];
	smallWordnet: Definition[];

	constructor(plugin: LangsoftPlugin) {
		this.plugin = plugin;
		this.loadWordnetDict();
		this.init();
		// this.buildSmallDict();
	}

	async init() {
		//check dictionary folder exists
		const dictFolder = this.plugin.settings.dictionaryFolder;
		const isDictFolder = await this.plugin.app.vault.adapter.exists(dictFolder)
		if (!isDictFolder) {
			try {
				this.plugin.app.vault.adapter.mkdir(dictFolder)
			} catch (e) {
				console.log(e)
			}
		}

		//get a list of JSON dictionaries in folder
		const allFilesInFolder = await this.plugin.app.vault.adapter.list(dictFolder);
		const jsonFiles: string[] = allFilesInFolder.files.filter((file: string) => file.endsWith(".json"));

		//check if primary dictionary exists (<user>_<language>.json)
		const primaryDict = this.plugin.settings.user + "_" + this.plugin.settings.language + ".json";
		const primaryDictFullPath = path.join(dictFolder, primaryDict)


		if (jsonFiles.includes(primaryDictFullPath) !== true) {
			//need to create one
			try {
				await this.plugin.app.vault.adapter.write(primaryDictFullPath, '')
			} catch (e) {
				console.log(e)
			}
		}

	}

	async loadWordnetDict() {
		const jsonPath = "dict-WordNet.json";
		if (await this.plugin.app.vault.adapter.exists(jsonPath)) {
			const wordnetFile = await this.plugin.app.vault.adapter.read(jsonPath)
			this.wordnet = JSON.parse(wordnetFile)

		}
	}

	async buildSmallDict() {
		// loop through all words in current file and append them to a smaller list of unique words that have been seen
		const activeFile = this.plugin.app.workspace.getActiveFile()
		if (activeFile) {
			const file = await this.plugin.app.vault.read(activeFile)
			const wordRegex = /\b\w+\b/g;
			const words = file.match(wordRegex);
			const uniqueWords = new Set(words);

			const results = [];

			for (const word of uniqueWords) {
				const result = this.wordnet.find(element => element.SearchTerm === word);
				if (result) {
					results.push(result);
				}
			}
			this.smallWordnet = results;
		}

	}

	isWordInSmallDict(term: string) {
		if (!term) {
			return false
		}
		const result = this.smallWordnet.find(element => element.SearchTerm === term)
		if (result) {
			return true
		} else {
			return false
		}
	}



	// async isWordInDict(term: string) {
	// 	if (!term) {
	// 		return false
	// 	}
	// 	// const result = this.wordnet.find(element => element.SearchTerm === term)
	// 	for (const wordnet of this.wordnet) {
	// 		if (wordnet.Term === term) {
	// 			return true
	// 		}
	// 	}
	// 	return false
	// 	// if (result) {
	// 	// 	return true
	// 	// } else {
	// 	// 	return false
	// 	// }
	// }


	async isWordInDict(term: string): Promise<boolean> {
		if (!term) return false;
		return new Promise(resolve => {
			setTimeout(() => {
				// if (term in this.wordnet) {
				// 	// console.log(term)
				// 	return true
				// }
				for (const wordnet of this.wordnet) {
					if (wordnet.Term === term) {
						resolve(true);
						return;
					}
				}
				resolve(false);
			}, 0); // Delay of 0ms to push execution to the event loop
		});
	}


	// async isWordInDict(term: string): Promise<boolean> {
	// 	return Promise.resolve().then(() => {
	// 		if (!term) return false;
	// 		return this.wordnet.some(entry => entry.Term === term);
	// 	});
	// }



	searchInWordnetDict(words: WordPositions[]): DecorationSpec[] {

		const decoSpec: DecorationSpec[] = [];

		for (const wordnet of this.wordnet) {
			for (const word of words) {
				if (wordnet.SearchTerm === word.word) {
					decoSpec.push({
						knownLevel: "known",
						start: word.startPosInLine,
						end: word.endPosInLine
					});
				}
			}

		}
		return decoSpec;
	}

	searchWordInDict(word: string) {
		const results = [];
		const result = this.wordnet.find(element => element.SearchTerm === word);
		if (result) {
			results.push(result);
		}
		return results
	}












}

