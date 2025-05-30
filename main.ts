import { Editor, MarkdownView, Plugin, WorkspaceLeaf } from "obsidian";
import { EditorView, hoverTooltip, ViewUpdate } from "@codemirror/view";
import { Highlighter } from "highlighter";
import { DEFAULT_SETTINGS, LangsoftPluginSettings, LangsoftSettingsTab } from "settings";
import { DictionaryManager } from "dictionaries";
import { VIEW_TYPE_DEFINER, DefinerView } from "definer";
import { reverse } from "dns";


export default class LangsoftPlugin extends Plugin {
	highlighter: Highlighter;
	settings: LangsoftPluginSettings;
	settingsTab: LangsoftSettingsTab
	dictManager: DictionaryManager
	styleEl: Element;


	async onload() {
		await this.loadSettings()
		this.settingsTab = new LangsoftSettingsTab(this.app, this)
		this.addSettingTab(this.settingsTab)
		this.highlighter = new Highlighter(this);
		this.registerEditorExtension(this.highlighter.highlightField);
		this.dictManager = new DictionaryManager(this)
		this.styleEl = document.head.createEl("style");
		this.updateStyle()
		this.registerEditorExtension(this.wordHover);
		// this.registerEditorExtension(selectionUpdateListener);

		// Add command to trigger highlighting
		this.addCommand({
			id: "highlight-selection",
			name: "Highlight Selection",
			editorCallback: (editor: Editor) => {
				const view = editor.cm as EditorView; // Get CodeMirror view from Obsidian
				// if (view) highlightSelection(view);
				if (view) {
					this.highlighter.removeAllHightlights(view);
					this.highlighter.highlightAllWords(view);
				}
			},
		});


		this.registerView(
			VIEW_TYPE_DEFINER,
			(leaf) => new DefinerView(leaf, this)
		);

		this.registerDomEvent(document.body, "mouseup", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const selectedText = view.editor.getSelection();
				let context = " ";
				if (selectedText !== "") {
					context = this.getContextForSelection(view.editor)
				} else {
					context = " ";
				}

				// const cursor = view.editor
				this.activateView();
				const leaf = this.getDefinerViewLeaf();
				leaf.handleSelection(selectedText.trim(), context);
			}
		}
		);

		this.registerEvent(
			this.app.workspace.onLayoutReady(() => {
				// const leaf = this.app.workspace.activeEditor
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					const editorView = activeView.editor.cm as EditorView;
					this.highlighter.highlightAllWords(editorView);
				}
			})
		);


		let debounceTimerLeafChange: number | null = null;
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (debounceTimerLeafChange) {
					clearTimeout(debounceTimerLeafChange);
				}

				debounceTimerLeafChange = window.setTimeout(() => {
					if (leaf?.view instanceof MarkdownView) {
						const editorView = leaf.view.editor.cm;
						this.highlighter.highlightAllWords(editorView);
					}
				}, 200);
			})
		);


	}

	// handleSelection(selection: string) {
	// 	this.activateView();
	// 	const leaf = this.getDefinerViewLeaf();
	// 	// leaf.searchTerm.setValue(selection);
	// 	// leaf.listContainer.empty();
	// }

	getDefinerViewLeaf() {
		return this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER)[0].view as DefinerView;

	}

	updateStyle() {
		this.styleEl.textContent = this.settingsToStyle()
	}

	settingsToStyle() {
		let style = "";

		const highlightTypes = ["unknown", "semiknown", "known"]
		const enabled = [this.settings.unknownEnabled, this.settings.semiknownEnabled, this.settings.knownEnabled]
		const colors = [this.settings.unknownColor, this.settings.semiknownColor, this.settings.knownColor]
		for (let i = 0; i < highlightTypes.length; i++) {
			if (enabled[i]) {
				style = style.concat(`.${highlightTypes[i]} { color: ${colors[i]};} \n`);
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
		let start = pos, end = pos;
		// Expand selection to include the full word
		while (start > from && /\w/.test(text[start - from - 1])) start--;
		while (end < to && /\w/.test(text[end - from])) end++;
		if ((start == pos && side < 0) || (end == pos && side > 0)) return null;
		const word = text.slice(start - from, end - from);
		// Fetch the dictionary definition asynchronously
		return this.dictManager.searchUserDict(word).then((entry) => {
			if (!entry || entry.deleted) return null; // No tooltip if nothing is found
			const dom = document.createElement("div");
			dom.classList.add("tooltip");
			// dom.textContent = entry.definitions.map(d => d.definition).join(" / ");
			dom.textContent = entry.definitions
				.filter(def => !def.deleted) // Exclude deleted definitions
				.map(def => def.definition)
				.join(" / ");
			return {
				pos: start,
				end,
				above: false,
				strictSide: true,
				create(view) {
					return { dom };
				},
			};
		});
	});

	async activateView() {
		const { workspace } = this.app;

		// let leaf: WorkspaceLeaf | null = null;
		// const leaves = workspace.getLeavesOfType(VIEW_TYPE_DEFINER);
		//
		// if (leaves.length > 0) {
		// 	// A leaf with our view already exists, use that
		// 	leaf = leaves[0];
		// } else {
		// 	// Our view could not be found in the workspace, create a new leaf
		// 	// in the right sidebar for it
		// 	leaf = workspace.getRightLeaf(false);
		// 	await leaf.setViewState({ type: VIEW_TYPE_DEFINER, active: true });
		// }
		// // "Reveal" the leaf in case it is in a collapsed sidebar
		const leaf = this.getDefinerViewLeaf()
		workspace.revealLeaf(leaf.leaf);
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


	onunload() {
		this.styleEl.remove();
	}

}


// export const wordHover = hoverTooltip((view, pos, side) => {
// 	const { from, to, text } = view.state.doc.lineAt(pos);
// 	let start = pos,
// 		end = pos;
//
// 	// Expand selection to include the full word
// 	while (start > from && /\w/.test(text[start - from - 1])) start--;
// 	while (end < to && /\w/.test(text[end - from])) end++;
//
// 	if ((start == pos && side < 0) || (end == pos && side > 0)) return null;
//
// 	const word = text.slice(start - from, end - from);
//
//
// 	return {
// 		pos: start,
// 		end,
// 		above: false, // Position below by default
// 		strictSide: true, // Prevents tooltip flipping side unexpectedly
// 		create(view) {
// 			const dom = document.createElement("div");
// 			dom.classList.add("tooltip");
// 			dom.textContent = word;
// 			return { dom };
// 		},
// 	};
// });


// let debounceTimerSelectionChange: number | null = null;
// const selectionUpdateListener = EditorView.updateListener.of((update: ViewUpdate) => {
// 	if (!update.selectionSet) return;
// 	if (debounceTimerSelectionChange) clearTimeout(debounceTimerSelectionChange);
// 	debounceTimerSelectionChange = setTimeout(() => {
// 		const from = update.state.selection.ranges[0].from;
// 		const to = update.state.selection.ranges[0].to;
// 		if (from === to) {
// 			console.log("just clicked")
// 		} else {
// 			console.log("selected something")
// 		}
// 		// console.log(from, to);
// 		// if (update.state.selection.ranges.length)
// 	}, 200);
// });


	// if (isCursorInsideDecoration(state, pos)) {
	// 	console.log("Cursor is inside a marked word.");
	// } else {
	// 	console.log("Cursor is in plain text.");
	// }

////
//// Function to check if cursor is inside a decoration
//// function isUserTyping(state: EditorState,)
//function isCursorInsideDecoration(state: EditorState, pos: number): boolean {
//	const decorations = state.field(highlightField, false);
//	if (!decorations) return false;
//
//	let found = false;
//	decorations.between(pos, pos, () => {
//		found = true;
//		return false; // Stop searching once we find a decoration
//	});
//
//	return found;
//}
//
//
//
