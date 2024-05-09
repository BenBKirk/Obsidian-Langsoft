import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
// import { ViewUpdate, PluginValue, EditorView, ViewPlugin, } from "@codemirror/view";
import { LangsoftViewPlugin } from 'syntaxHighlight';
import { Extension } from '@codemirror/state';
import { LangsoftPluginSettings, DEFAULT_SETTINGS, LangsoftSettingsTab } from 'settings';
import { DictionaryManager } from 'dictionaries';



export default class LangsoftPlugin extends Plugin {
	settings: LangsoftPluginSettings;
	extensions: Extension[];
	wordsToOverrideDict: { [word: string]: string }
	styleEl: Element;
	dictionaryManager: DictionaryManager;

	
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LangsoftSettingsTab(this.app, this));


		this.dictionaryManager = new DictionaryManager(this);

		// console.log(await this.dictionaryManager.listFiles())
		// console.log(await this.dictionaryManager.dictFolderExists(".langsoft_dictionaries"))


		this.extensions = [LangsoftViewPlugin];
		this.registerEditorExtension(this.extensions);

		this.styleEl = document.head.createEl("style");
		this.reloadStyle();

			
		this.registerDomEvent(document.body, "mouseup", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const selectedText = view.editor.getSelection();
				if (selectedText !== "") {
				this.handleSelection(selectedText.trim());
				}
			}
		}
		);



	}

	onunload() {

	}

	handleSelection(selection: string) {
			new Notice(selection);
			// console.log(selection);
			const timestamp = Date.now();
			const date = new Date(timestamp);
			// console.log(date.toJSON());
			// console.log(this.settings.user);
		
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	convertSettingsToStyle(settings: LangsoftPluginSettings) {
		let style = "";

		const knownLevel = ["unknown", "semiKnown", "known"];
		const enabled = [settings.unknownEnabled, settings.semiKnownEnabled, settings.knownEnabled];
		const colors = [settings.unknownColor, settings.semiKnownColor, settings.knownColor];

		for (let i = 0; i < knownLevel.length; i++) {
			if (enabled[i]) {
				if (settings.classToApplyHighlightingTo.length > 0) {
					style = style.concat(`.${settings.classToApplyHighlightingTo} .${knownLevel[i]} { color: ${colors[i]} }\n`);
				}
				else {
					style = style.concat(`.${knownLevel[i]} { color: ${colors[i]} }\n`);
				}
			}
		}

		return style;

	}

	reloadStyle() {
		this.styleEl.textContent = this.convertSettingsToStyle(this.settings);
	}

	loadWordsToOverrideDict() {
		const dict: { [word: string]: string } = {};

		const lines = this.settings.wordsToOverride.split("\n");
		lines.forEach(val => {
			const line = val.replace(" ", "").split(":");

			if (line[1])
				dict[line[0]] = line[1];
		});

		this.wordsToOverrideDict = dict;
	}

	reloadEditorExtensions() {
		this.extensions.pop();
		this.app.workspace.updateOptions();
		this.extensions.push(LangsoftViewPlugin.extension);
		this.app.workspace.updateOptions();
	}
}

// class SampleModal extends Modal {
// 	constructor(app: App) {
// 		super(app);
// 	}
//
// 	onOpen() {
// 		const {contentEl} = this;
// 		contentEl.setText('Woah!');
// 	}
//
// 	onClose() {
// 		const {contentEl} = this;
// 		contentEl.empty();
// 	}
// }
//
