import LangsoftPlugin from "main";
import * as path from 'path';


interface Context {
	level: string;
	timeStamp: string;
	file: string;
	sentence: string;
}

interface Definition {
	Definition: string;
	contexts: Context[];
}

// a list of entries makes up a dictionary
interface Entry {
	Term: string;
	Definitions: Definition[];
}

interface Dictionary {
	entry: Entry[];
}
// a bookself can hold more than one dictionary (useful for holding coworkers dictionaries)
interface Bookshelf {
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
		this.dictFolder = await this.getDictionaryFolder();
		this.availableDictionaries = await this.getAvailableDictionaries();
		this.userDict = await this.loadPrimaryDictionary();



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
		return dictName;

	}

	async getAvailableDictionaries() {
		//get a list of JSON dictionaries in folder
		const allFilesInFolder = await this.plugin.app.vault.adapter.list(this.dictFolder);
		const jsonFiles: string[] = allFilesInFolder.files.filter((file: string) => file.endsWith(".json"));
		return jsonFiles;
	}

	async loadPrimaryDictionary() {
		//check if primary dictionary exists (<user>.json)
		const primaryDict = this.plugin.settings.user + ".json";
		const primaryDictFullPath: string = path.join(this.dictFolder, primaryDict).toString();

		if (this.availableDictionaries.includes(primaryDictFullPath)) {

			const dict = await this.plugin.app.vault.adapter.read(primaryDictFullPath);
			// load into memory
			// this.userDict = JSON.parse(dict);
			return JSON.parse(dict);

		} else {
			//need to create a dcin
			try {
				console.log("creating new empty dictionary: ", primaryDictFullPath)
				await this.plugin.app.vault.adapter.write(primaryDictFullPath, '')
			} catch (e) {
				console.log(e)
			}
			return {} as JSON;
		}
	}

	async searchUserDict(searchTerm: string) {
		if (!searchTerm) {
			return;
		}
		if (!this.userDict) {
			return;
		}

		for (const entry of this.userDict) {
			if (entry.Term.toLowerCase() === searchTerm.toLowerCase()) {
				return entry.Definitions[0].Definition;
			}
		}

		// for (const item of this.wordnet) {
		// 	if (item.Term === searchTerm.toLowerCase()) {
		// 		return item.Definition;
		// 	}
		// }

	}


	async loadWordnetDict() {
		const jsonPath = "dict-WordNet.json";
		if (await this.plugin.app.vault.adapter.exists(jsonPath)) {
			const wordnetFile = await this.plugin.app.vault.adapter.read(jsonPath)
			this.wordnet = JSON.parse(wordnetFile)

		}
	}






}

