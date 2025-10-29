import { Editor, MarkdownView, Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { EditorView, hoverTooltip, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { createSelectionHighlightPlugin, createHighlightPlugin, TriggerEffect, TriggerField } from "highlighter";
import { DEFAULT_SETTINGS, LangsoftPluginSettings, LangsoftSettingsTab } from "settings";
import { DictionaryManager } from "dictionaries";
import { VIEW_TYPE_DEFINER, DefinerView } from "definer";


export default class LangsoftPlugin extends Plugin {
	myViewPlugin: ViewPlugin;
	mySelectionViewPlugin: ViewPlugin;
	settings: LangsoftPluginSettings;
	settingsTab: LangsoftSettingsTab;
	dictManager: DictionaryManager;
	styleEl: Element;
	SelectedText: Array<number>;
	lastFile: TFile;
	oldPosition: number;


	async onload() {
		this.SelectedText = [];
		this.oldPosition = 0;
		await this.loadSettings()
		this.settingsTab = new LangsoftSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		this.myViewPlugin = createHighlightPlugin(this);
		this.mySelectionViewPlugin = createSelectionHighlightPlugin(this);
		this.registerEditorExtension(this.myViewPlugin);
		this.registerEditorExtension(this.mySelectionViewPlugin);
		this.registerEditorExtension(TriggerField);

		this.dictManager = new DictionaryManager(this)
		this.styleEl = document.head.createEl("style");
		this.updateStyle()
		this.registerEditorExtension(this.wordHover);


		this.registerView(
			VIEW_TYPE_DEFINER,
			(leaf) => new DefinerView(leaf, this)
		);


		// this.registerDomEvent(document.body, "", (event) => {
		// 	if (event.ctrlKey) {
		// 		const editor = this.app.workspace.activeEditor?.editor;
		// 		console.log("before ctrl click ", editor?.posToOffset(editor.getCursor()));
		// 	}
		// });



		this.registerDomEvent(document.body, "mouseup", (event) => {
			this.SelectedText = [];

			if (event.ctrlKey) {
				const editor = this.app.workspace.activeEditor?.editor;
				// console.log("After: ", editor?.posToOffset(editor.getCursor()));
				if (!editor) return;
				let selectedText = "";
				let context = "";
				selectedText = editor.getSelection().trim();
				console.log(selectedText)
				if (selectedText !== "") {
					console.log("is selection")
				} else {
					const word = this.selectWordAtCursor(editor);
					if (word) {
						selectedText = word;
					} else {
						console.log("nothing to do")
						return;
					}
				}
				context = this.getContextForSelection(editor)

				const fromCursor = editor.getCursor("from")
				const toCursor = editor.getCursor("to")
				// const cursor = editor.getCursor();
				const start = editor.posToOffset(fromCursor)
				const end = editor.posToOffset(toCursor)
				this.SelectedText = [start, end];
				this.refreshHighlights()


				this.activateView();
				const leaf = this.getDefinerViewLeaf();
				leaf.handleSelection(selectedText.trim(), context);
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
				}

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
		const pos = cursor.ch;

		const regex = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;

		let match;
		while ((match = regex.exec(lineText)) !== null) {
			const start = match.index;
			const end = start + match[0].length;

			if (pos >= start && pos <= end) {
				// Select that word
				editor.setSelection(
					{ line: cursor.line, ch: start },
					{ line: cursor.line, ch: end }
				);

				return match[0];
			}
		}

		return null;
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
		console.log("this function was called")
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view instanceof MarkdownView ? leaf.view : null;
			if (mdView) {
				const cm = (mdView.editor as any).cm as EditorView;
				cm.dispatch({ effects: TriggerEffect.of(null) });
			}
		}
	}


	getDefinerViewLeaf() {
		return this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER)[0].view as DefinerView;

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

		const highlightTypes = ["unknown", "semiknown", "known", "coworker"]
		const highlightTypesUnderline = ["unknownunderline", "semiknownunderline", "knownunderline", "coworkerunderline"]
		const enabled = [this.settings.unknownEnabled, this.settings.semiknownEnabled, this.settings.knownEnabled, this.settings.coworkerEnabled]
		const colors = [this.settings.unknownColor, this.settings.semiknownColor, this.settings.knownColor, this.settings.coworkerColor]
		for (let i = 0; i < highlightTypes.length; i++) {
			if (enabled[i]) {
				// style = style.concat(`.${highlightTypes[i]} { color: ${colors[i]};} \n`);
				style = style.concat(`.${highlightTypes[i]} { background-color: ${this.hexToRGB(colors[i], 0.2)}; } \n`);
			}
		}
		for (let i = 0; i < highlightTypesUnderline.length; i++) {
			if (enabled[i]) {
				// style = style.concat(`.${highlightTypesUnderline[i]} {text-decoration: underline; text-decoration-color: ${this.hexToRGB(colors[i], 0.2)}; text-decoration-thickness: 3px;} \n`);
				// style = style.concat(`.${highlightTypesUnderline[i]} { background-color: ${this.hexToRGB(colors[i], 0.2)}; } \n`);
				style = style.concat(`.${highlightTypesUnderline[i]} {text-decoration: underline; text-decoration-color: ${this.hexToRGB(colors[i], 0.5)}; text-decoration-thickness: 5px;} \n`);
				// style = style.concat(`.${highlightTypesUnderline[i]} {display: inline-blocks; padding: 5px; border-bottom: 2px solid ${this.hexToRGB(colors[i], 0.2)}; border-left: 2px solid ${this.hexToRGB(colors[i], 0.2)}; border-right: 2px solid ${this.hexToRGB(colors[i], 0.2)};} \n`);
			}
		}
		return style;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.dictManager.init();
	}

	wordHover = hoverTooltip((view, pos, side) => {
		const { from, to, text } = view.state.doc.lineAt(pos);
		let start = pos,
			end = pos;

		// Expand selection to include the full word
		while (start > from && /\w/.test(text[start - from - 1])) start--;
		while (end < to && /\w/.test(text[end - from])) end++;

		if ((start == pos && side < 0) || (end == pos && side > 0)) return null;

		const word = text.slice(start - from, end - from).toLowerCase();

		try {
			const def = this.dictManager.userDict[word];
			if (!def || def.highlight == "None") {
				return null;
			}
			const defs: string[] = [];
			for (const [key, val] of Object.entries(def.definitions)) {
				if (!val.deleted) {
					defs.push(key);
				}
			}
			return {
				pos: start,
				end,
				above: true, // ✅ Force tooltip to appear ABOVE the word
				strictSide: true, // Prevents tooltip from flipping sides unexpectedly
				create(view) {
					const dom = document.createElement("div");
					dom.classList.add("tooltip");
					dom.textContent = defs.join(" / ");
					return { dom };
				},
			};

		} catch {
			// console.log("no def for hover")
		}
	});


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


	getContextForSelection(editor: Editor) {
		const lenContextWords = 7;
		const selection = editor.getSelection();
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const regex = /\s+/;
		const textBeforeSel = line.slice(0, cursor.ch - selection.length)
		const textAfterSel = line.slice(cursor.ch, line.length)
		let wordListBefore = textBeforeSel.split(regex);
		let wordListAfter = textAfterSel.split(regex);
		if (wordListBefore.length > lenContextWords) {
			wordListBefore = wordListBefore.reverse().slice(0, lenContextWords);
			wordListBefore[lenContextWords - 1] = "..." + wordListBefore[lenContextWords - 1];
			wordListBefore = wordListBefore.reverse();
		}
		if (wordListAfter.length > lenContextWords) {
			wordListAfter = wordListAfter.slice(0, lenContextWords);
			wordListAfter[lenContextWords - 1] = wordListAfter[lenContextWords - 1] + "...";
		}
		const wordsBefore = wordListBefore.join(" ")
		const wordsAfter = wordListAfter.join(" ")
		return `${wordsBefore} <u>${selection} </u>${wordsAfter}`
	}

	parseIntoWords(text: string, offset: number) {
		// const regex = /\b\w+\b/g;
		const regex = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;
		const words: { text: string; from: number; to: number }[] = [];
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			if (match.index != null) {
				words.push({
					text: match[0],
					from: match.index + offset,
					to: match.index + offset + match[0].length,
				});
			}
		}
		return words;
	}




	onunload() {
		this.styleEl.remove();
	}

}


