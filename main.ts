import { App, debounce, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, WorkspaceLeaf } from 'obsidian';
// import { ViewUpdate, PluginValue, EditorView, ViewPlugin, Decoration, DecorationSet } from "@codemirror/view";
// import { LangsoftViewPlugin } from 'syntaxHighlight';
import { LangsoftPluginSettings, DEFAULT_SETTINGS, LangsoftSettingsTab } from 'settings';
import { DictionaryManager } from 'dictionaries';
import { DefinerView, VIEW_TYPE_DEFINER } from 'definer';
// import { buildHighlightPlugin } from 'viewPlugin';
// import { emojiListField, apiRequestExtension } from 'stateTest';
// import { buildExampleViewPlugin } from 'exampleView';

import { testPlugin, decorationField } from 'simpleView';



export default class LangsoftPlugin extends Plugin {
	settings: LangsoftPluginSettings;
	// extensions: Extension[];
	wordsToOverrideDict: { [word: string]: string }
	styleEl: Element;
	dictionaryManager: DictionaryManager;
	// viewPlugin: ViewPlugin<PluginValue>;


	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LangsoftSettingsTab(this.app, this));
		this.dictionaryManager = new DictionaryManager(this);
		// const debouncedBuildSmallDict = debounce( async ()=> {
		// 	await this.dictionaryManager.buildSmallDict()
		// },300,true);
		// this.app.workspace.on("active-leaf-change",() => debouncedBuildSmallDict())
		// this.extensions = [LangsoftViewPlugin];
		// this.registerEditorExtension(this.extensions);
		// this.registerEditorExtension([emojiListField, apiRequestExtension]);



		// this.viewPlugin = buildExampleViewPlugin(this);
		this.registerEditorExtension([testPlugin(this), decorationField]);
		// this.registerEditorExtension([decorationField,decorationPlugin]);
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




		this.registerView(
			VIEW_TYPE_DEFINER,
			(leaf) => new DefinerView(leaf, this)
		);




	}

	onunload() {

	}


	handleSelection(selection: string) {
		// const results = this.dictionaryManager.searchInWordnetDict(selection);
		// console.log(results)
		// new Notice(results);

		this.activateView();

		this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER).forEach((leaf) => {
			if (leaf.view instanceof DefinerView) {
				// Access your view instance.
				leaf.view.searchTerm.setValue(selection);
				// if (results.length > 0) {
				// 	try {
				// leaf.view.wordDefinition.setValue(results[0]["Definition"]);
				// console.log()
				// 	} catch (e) {
				// 		console.log(e)
				// 	}
				// }
			}
		});

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	convertSettingsToStyle(settings: LangsoftPluginSettings) {
		let style = "";

		const knownLevel = ["unknown", "semiknown", "known"];
		const enabled = [settings.unknownEnabled, settings.semiknownEnabled, settings.knownEnabled];
		const colors = [settings.unknownColor, settings.semiknownColor, settings.knownColor];

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

		this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER).forEach((leaf) => {
			if (leaf.view instanceof DefinerView) {
				// Access your view instance.
				leaf.detach()
			}
		});
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

	// reloadEditorExtensions() {
	// 	this.extensions.pop();
	// 	this.app.workspace.updateOptions();
	// 	this.extensions.push(LangsoftViewPlugin.extension);
	// 	this.app.workspace.updateOptions();
	// }

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_DEFINER);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_DEFINER, active: true });
		}
		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf);
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
