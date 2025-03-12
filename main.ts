import { Editor, MarkdownView, Plugin } from "obsidian";
import { EditorView, hoverTooltip } from "@codemirror/view";
import { Highlighter } from "highlighter";
import { DEFAULT_SETTINGS, LangsoftPluginSettings, LangsoftSettingsTab } from "settings";
import { DictionaryManager } from "dictionaries";


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
		this.highlighter = new Highlighter;
		this.registerEditorExtension(this.highlighter.highlightField);
		this.dictManager = new DictionaryManager(this)
		this.styleEl = document.head.createEl("style");
		this.updateStyle()
		this.registerEditorExtension(wordHover);
		// this.registerEditorExtension(updateListener);

		// Add command to trigger highlighting
		this.addCommand({
			id: "highlight-selection",
			name: "Highlight Selection",
			editorCallback: (editor: Editor) => {
				const view = editor.cm as EditorView; // Get CodeMirror view from Obsidian
				// if (view) highlightSelection(view);

				if (view) this.highlighter.highlightAllWords(view);
			},
		});

		// this.registerEvent(
		// 	this.app.workspace.on("active-leaf-change", () => {
		// 		this.highlightInActiveView();
		// 	})
		// );

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
		console.log(style)
		return style;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}



	onunload() {
		this.styleEl.remove();
	}

}


export const wordHover = hoverTooltip((view, pos, side) => {
	const { from, to, text } = view.state.doc.lineAt(pos);
	let start = pos,
		end = pos;

	// Expand selection to include the full word
	while (start > from && /\w/.test(text[start - from - 1])) start--;
	while (end < to && /\w/.test(text[end - from])) end++;

	if ((start == pos && side < 0) || (end == pos && side > 0)) return null;

	const word = text.slice(start - from, end - from);


	return {
		pos: start,
		end,
		above: false, // Position below by default
		strictSide: true, // Prevents tooltip flipping side unexpectedly
		create(view) {
			const dom = document.createElement("div");
			dom.classList.add("tooltip");
			dom.textContent = word;
			return { dom };
		},
	};
});

// // Update listener to check if user is typing inside a decoration
// const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
// 	if (!update.docChanged) return;
// 	const state = update.state;
// 	const pos = state.selection.main.head;
//
// 	if (isCursorInsideDecoration(state, pos)) {
// 		console.log("Cursor is inside a marked word.");
// 	} else {
// 		console.log("Cursor is in plain text.");
// 	}
// });


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
