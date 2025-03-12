import { Editor, MarkdownView, Plugin } from "obsidian";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, ViewUpdate } from "@codemirror/view";
import { Highlighter } from "highlighter";


export default class LangsoftPlugin extends Plugin {
	highlighter: Highlighter


	async onload() {
		console.log("Highlight Plugin loaded");

		// Register the highlight extension in CodeMirror
		// this.registerEditorExtension(wordEditTracker);
		this.highlighter = new Highlighter;
		this.registerEditorExtension(this.highlighter.highlightField);
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


	onunload() {
		console.log("Highlight Plugin unloaded");
	}

}






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
