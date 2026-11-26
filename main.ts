import { Editor, MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { EditorView, hoverTooltip } from "@codemirror/view";
import { createSelectionHighlightPlugin, createHighlightPlugin, TriggerEffect, TriggerField } from "highlighter";
import { DEFAULT_SETTINGS, LangsoftPluginSettings, LangsoftSettingsTab } from "settings";
import { DictionaryManager } from "dictionaries";
import { VIEW_TYPE_DEFINER, DefinerView } from "definer";
import { buildSelectionContext, findWordAt, parseIntoWords as splitIntoWords } from "words";


export default class LangsoftPlugin extends Plugin {
	myViewPlugin: ReturnType<typeof createHighlightPlugin>;
	mySelectionViewPlugin: ReturnType<typeof createSelectionHighlightPlugin>;
	settings: LangsoftPluginSettings;
	settingsTab: LangsoftSettingsTab;
	dictManager: DictionaryManager;
	styleEl: Element;
	SelectedText: Array<number>;
	lastFile: TFile;
	lastTabIndex: number;


	async onload() {
		this.SelectedText = [];
		this.lastTabIndex = 0;
		await this.loadSettings()
		this.settingsTab = new LangsoftSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		this.myViewPlugin = createHighlightPlugin(this);
		this.mySelectionViewPlugin = createSelectionHighlightPlugin(this);
		this.registerEditorExtension(this.myViewPlugin);
		this.registerEditorExtension(this.mySelectionViewPlugin);
		this.registerEditorExtension(TriggerField);

		this.dictManager = new DictionaryManager(this);
		this.dictManager.init();
		this.styleEl = document.head.createEl("style");
		this.updateStyle()
		this.registerEditorExtension(this.wordHover);


		this.registerView(
			VIEW_TYPE_DEFINER,
			(leaf) => new DefinerView(leaf, this)
		);



		this.registerDomEvent(document.body, "mouseup", async (event) => {
			this.SelectedText = [];
			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor) return;

			try {
				const tab = this.app.workspace.getMostRecentLeaf();  // active tab
				// the pane that holds the tabs (`parent` exists at runtime but is missing from the typings)
				const parent = (tab as unknown as { parent: { children: (WorkspaceLeaf | null)[] } }).parent;
				const tabIndex = parent.children.indexOf(tab);           // 0-based index
				this.lastTabIndex = tabIndex
			} catch (e) {
				this.lastTabIndex = 0
			}

			if (event.ctrlKey) {
				// console.log("After: ", editor?.posToOffset(editor.getCursor()));
				// let selectedText = "";
				// let context = "";
				let selectedText = editor.getSelection().trim();
				if (selectedText == "") {
					const word = this.selectWordAtCursor(editor);
					if (word) {
						selectedText = word;
					} else {
						const leaf = await this.activateView();
						leaf?.handleSelection("", "");
						return;
					}
				}

				const fromCursor = editor.getCursor("from")
				const toCursor = editor.getCursor("to")
				// const cursor = editor.getCursor();
				const start = editor.posToOffset(fromCursor)
				const end = editor.posToOffset(toCursor)
				this.SelectedText = [start, end];
				this.refreshHighlights()
				// read the editor before awaiting, in case the selection changes meanwhile
				const context = this.getContextForSelection(editor);
				const leaf = await this.activateView();
				leaf?.handleSelection(selectedText.trim(), context);
				leaf?.getFocus();
			} else {
				this.refreshHighlights()
				const selection = editor.getSelection().trim();
				const context = this.getContextForSelection(editor);
				const leaf = await this.activateView();
				leaf?.handleSelection(selection, context);
			}



		}
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const file = this.app.workspace.getActiveFile()
				if (!file) return;

				if (!this.lastFile || file.path !== this.lastFile.path) {
					this.lastFile = file;
					this.SelectedText = [];
					this.getDefinerViewLeaf()?.handleSelection("", "");
				}


				this.dictManager.reloadOtherDictsIfChanged();

			})
		);


		// this.registerDomEvent(document, "dblclick", () => {
		//
		// 	const editor = this.app.workspace.activeEditor?.editor;
		// 	if (!editor) return;
		//
		// 	// const result = this.getWordAtCursor(editor);
		// 	// if (result) {
		// 	// 	new Notice(`Double-clicked word: ${result.word}`);
		// 	// 	editor.setSelection(result.from, result.to);
		// 	// }
		// 	const word = this.selectWordAtCursor(editor);
		// 	if (word) {
		// 		const context = this.getContextForSelection(editor)
		// 		// new Notice(`Selected word: ${word} context: ${context}`);
		// 		this.activateView();
		// 		const leaf = this.getDefinerViewLeaf();
		// 		leaf.handleSelection(word.trim(), context);
		// 	}
		// });

	}


	selectWordAtCursor(editor: Editor) {
		const cursor = editor.getCursor();
		const lineText = editor.getLine(cursor.line);
		const word = findWordAt(lineText, cursor.ch);
		if (!word) return null;

		// Select that word
		editor.setSelection(
			{ line: cursor.line, ch: word.from },
			{ line: cursor.line, ch: word.to }
		);
		return word.text;
	}

	// getWordAtCursor(editor: Editor): { word: string; from: number; to: number } | null {
	// 	const cursor = editor.getCursor();
	// 	const lineText = editor.getLine(cursor.line);
	// 	const pos = cursor.ch;
	//
	// 	const regex = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;
	//
	// 	let match;
	// 	while ((match = regex.exec(lineText)) !== null) {
	// 		const start = match.index;
	// 		const end = start + match[0].length;
	//
	// 		if (pos >= start && pos <= end) {
	// 			return { word: match[0], from: start, to: end };
	// 		}
	// 	}
	//
	// 	return null;
	// }

	refreshHighlights() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view instanceof MarkdownView ? leaf.view : null;
			if (mdView) {
				const cm = (mdView.editor as any).cm as EditorView;
				cm.dispatch({ effects: TriggerEffect.of(null) });
			}
		}
	}


	/** The open Definer sidebar, or null if it isn't open. */
	getDefinerViewLeaf(): DefinerView | null {
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER)[0]?.view;
		return view instanceof DefinerView ? view : null;

	}

	updateStyle() {
		this.styleEl.textContent = this.settingsToStyle()
	}

	hexToRGB(hex: string, alpha: number) {
		const r = parseInt(hex.slice(1, 3), 16),
			g = parseInt(hex.slice(3, 5), 16),
			b = parseInt(hex.slice(5, 7), 16);

		if (alpha) {
			return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
		} else {
			return "rgb(" + r + ", " + g + ", " + b + ")";
		}
	}

	settingsToStyle() {
		let style = "";

		const highlightTypes = ["unknown", "semiknown", "known", "coworker"];
		const highlightTypesUnderline = ["unknownunderline", "semiknownunderline", "knownunderline", "coworkerunderline"];
		const enabled = [
			this.settings.unknownEnabled,
			this.settings.semiknownEnabled,
			this.settings.knownEnabled,
			this.settings.coworkerEnabled
		];
		const colors = [
			this.settings.unknownColor,
			this.settings.semiknownColor,
			this.settings.knownColor,
			this.settings.coworkerColor
		];

		for (let i = 0; i < highlightTypes.length; i++) {
			if (enabled[i]) {
				style += `.${highlightTypes[i]} { 
                background-color: ${this.hexToRGB(colors[i], 0.2)}; 
            }\n`;
			}
		}

		for (let i = 0; i < highlightTypesUnderline.length; i++) {
			if (enabled[i]) {
				style += `.${highlightTypesUnderline[i]} { 
                text-decoration: underline; 
                text-decoration-color: ${this.hexToRGB(colors[i], 0.5)}; 
                text-decoration-thickness: 5px; 
            }\n`;
			}
		}

		style += `

		.tooltip.tooltip-adjusted {
			margin-top: -16px;          /* move up; adjust value as needed (-6px .. -16px) */
			transform-origin: center bottom;
			padding: 6px 8px;
			border-radius: 6px;
			background: var(--background-primary);
			color: var(--text-normal);
			box-shadow: var(--shadow-s);
		}

		.tooltip.tooltip-adjusted {
			transition: transform 0.12s ease, opacity 0.12s ease;
			opacity: 1;
		}
		`;

		// transform: translateY(-2px);
		return style;
	}


	// settingsToStyle() {
	// 	let style = "";
	//
	// 	const highlightTypes = ["unknown", "semiknown", "known", "coworker"]
	// 	const highlightTypesUnderline = ["unknownunderline", "semiknownunderline", "knownunderline", "coworkerunderline"]
	// 	const enabled = [this.settings.unknownEnabled, this.settings.semiknownEnabled, this.settings.knownEnabled, this.settings.coworkerEnabled]
	// 	const colors = [this.settings.unknownColor, this.settings.semiknownColor, this.settings.knownColor, this.settings.coworkerColor]
	// 	for (let i = 0; i < highlightTypes.length; i++) {
	// 		if (enabled[i]) {
	// 			// style = style.concat(`.${highlightTypes[i]} { color: ${colors[i]};} \n`);
	// 			style = style.concat(`.${highlightTypes[i]} { background-color: ${this.hexToRGB(colors[i], 0.2)}; } \n`);
	// 		}
	// 	}
	// 	for (let i = 0; i < highlightTypesUnderline.length; i++) {
	// 		if (enabled[i]) {
	// 			// style = style.concat(`.${highlightTypesUnderline[i]} {text-decoration: underline; text-decoration-color: ${this.hexToRGB(colors[i], 0.2)}; text-decoration-thickness: 3px;} \n`);
	// 			// style = style.concat(`.${highlightTypesUnderline[i]} { background-color: ${this.hexToRGB(colors[i], 0.2)}; } \n`);
	// 			style = style.concat(`.${highlightTypesUnderline[i]} {text-decoration: underline; text-decoration-color: ${this.hexToRGB(colors[i], 0.5)}; text-decoration-thickness: 5px;} \n`);
	// 			// style = style.concat(`.${highlightTypesUnderline[i]} {display: inline-blocks; padding: 5px; border-bottom: 2px solid ${this.hexToRGB(colors[i], 0.2)}; border-left: 2px solid ${this.hexToRGB(colors[i], 0.2)}; border-right: 2px solid ${this.hexToRGB(colors[i], 0.2)};} \n`);
	// 		}
	// 	}
	// 	return style;
	// }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.dictManager.init();
	}

	wordHover = hoverTooltip((view, pos, side) => {
		const line = view.state.doc.lineAt(pos);
		const match = findWordAt(line.text, pos - line.from);
		if (!match) return null;

		const word = match.text.toLowerCase();
		const def = this.dictManager.userDict[word];
		if (!def || def.highlight === "None") return null;

		const defs = Object.entries(def.definitions)
			.filter(([, v]) => !v.deleted)
			.map(([k]) => k);

		return {
			pos: line.from + match.from,
			end: line.from + match.to,
			above: true,
			strictSide: true,
			create() {
				const dom = document.createElement("div");
				dom.classList.add("tooltip", "tooltip-adjusted");
				dom.textContent = defs.join(" / ");
				return { dom };
			},
		};
	});


	/** Open the Definer sidebar if needed, and return it once it is ready. */
	async activateView(): Promise<DefinerView | null> {
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
			if (!leaf) return null;
			await leaf.setViewState({ type: VIEW_TYPE_DEFINER, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		// newer Obsidian versions return a promise here and only load the view once revealed
		await workspace.revealLeaf(leaf);
		return this.getDefinerViewLeaf();
	}


	getContextForSelection(editor: Editor) {
		const cursor = editor.getCursor();
		return buildSelectionContext(editor.getLine(cursor.line), cursor.ch, editor.getSelection());
	}

	parseIntoWords(text: string, offset: number) {
		return splitIntoWords(text, offset);
	}

		onunload() {
		this.styleEl.remove();
	}

}


