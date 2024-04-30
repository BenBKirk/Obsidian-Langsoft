import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ViewUpdate, PluginValue, EditorView, ViewPlugin, } from "@codemirror/view";
import { LangsoftViewPlugin } from 'syntaxHighlight';
import { Extension } from '@codemirror/state';
import { LangsoftPluginSettings, DEFAULT_SETTINGS, LangsoftSettingsTab } from 'settings';



export default class LangsoftPlugin extends Plugin {
	settings: LangsoftPluginSettings;
	extensions: Extension[];
	wordsToOverrideDict: {[word: string]: string}
	styleEl: Element;

	async onload() {
		await this.loadSettings();
		
		this.addSettingTab(new LangsoftSettingsTab(this.app,this))

		this.extensions = [LangsoftViewPlugin];
		this.registerEditorExtension(this.extensions);
		
		this.styleEl = document.head.createEl("style");
		this.reloadStyle();
		
		// // from chatgpt		
		// let isMouseDown = false;
		// let selectedText = "";
		//
		// this.registerDomEvent(document.body, "mousedown", () => {
		// 	isMouseDown = true;
		// 	selectedText = "";
		// });
		//
		// this.registerDomEvent(document.body, "mouseup", () => {
		// 	isMouseDown = false;
		// 	const selection = window.getSelection();
		// 	selectedText = selection.toString().trim();
		// 	if (selectedText) {
		// 		new Notice(selectedText);
		// 		console.log("Selected text:", selectedText);
		// 		// Do something with the selected text
		// 	}
		// });
		
	}

	onunload() {

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
		const dict: {[word: string]: string} = {};

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
		console.log('reloading entire plugin!')
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