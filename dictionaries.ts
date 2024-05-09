import LangsoftPlugin from "main";
import * as path from 'path';

export class DictionaryManager {
  plugin: LangsoftPlugin;

  constructor(plugin:LangsoftPlugin){
		this.plugin = plugin;
		this.init();
  }

  async init(){
    //check dictionary folder exists
    let dictFolder = this.plugin.settings.dictionaryFolder;
    let isDictFolder = await this.plugin.app.vault.adapter.exists(dictFolder)    
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
    console.log(jsonFiles);

    //check if primary dictionary exists (<user>_<language>.json)
    const primaryDict =  this.plugin.settings.user + "_" + this.plugin.settings.language + ".json";
    const primaryDictFullPath = path.join(dictFolder,primaryDict)

    if (jsonFiles.includes(primaryDictFullPath) !== true) {
      //need to create one
      try {
      await this.plugin.app.vault.adapter.write(primaryDictFullPath,'')
      } catch (e) {
        console.log(e)
      }

    } else {
      console.log("found it")
    }

    
    

    
  }

    
}

