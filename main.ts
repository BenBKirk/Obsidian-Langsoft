import { Editor, Plugin } from "obsidian";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, ViewUpdate } from "@codemirror/view";

export default class HighlightPlugin extends Plugin {
	async onload() {
		console.log("Highlight Plugin loaded");

		// Register the highlight extension in CodeMirror
		this.registerEditorExtension(highlightField);
		// this.registerEditorExtension(wordEditTracker);
		this.registerEditorExtension(updateListener);

		// Add command to trigger highlighting
		this.addCommand({
			id: "highlight-selection",
			name: "Highlight Selection",
			editorCallback: (editor: Editor) => {
				const view = editor.cm as EditorView; // Get CodeMirror view from Obsidian
				if (view) highlightSelection(view);
			},
		});
	}

	onunload() {
		console.log("Highlight Plugin unloaded");
	}
}

// Define an effect to trigger decoration updates
const addHighlight = StateEffect.define<{ from: number; to: number }>();

// Define a StateField to manage decorations
const highlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(deco, tr) {
		// Apply existing decorations to the new state
		deco = deco.map(tr.changes);

		// Apply effects (e.g., adding a highlight)
		for (const effect of tr.effects) {
			if (effect.is(addHighlight)) {
				const mark = Decoration.mark({ class: "cm-highlight" });
				deco = deco.update({ add: [mark.range(effect.value.from, effect.value.to)] });
			}
		}

		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

// Function to highlight selected text
function highlightSelection(view: EditorView) {
	const { from, to } = view.state.selection.main;
	if (from !== to) {
		view.dispatch({ effects: addHighlight.of({ from, to }) });
	}
}

// StateField to track cursor position and detect word edits
const wordEditTracker = StateField.define<string | null>({
	create() {
		return null;
	},
	update(currentWord, tr) {
		const { state } = tr;

		// Get the cursor position
		const pos = state.selection.main.head;
		const line = state.doc.lineAt(pos);

		// Regex to find the word at the cursor position
		const match = /\w+/.exec(line.text.slice(pos - line.from));

		if (match) {
			const word = match[0];

			// If the transaction changes the document, check if it's within the word
			if (tr.docChanged && word !== currentWord) {
				console.log("Editing word:", word);
				return word;
			}
		}

		return currentWord;
	},
});

// // Create an update listener to track word edits
// const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
// 	if (!update.docChanged) return; // Only run if the document changed
//
// 	const state = update.state;
// 	const pos = state.selection.main.head; // Cursor position
// 	const line = state.doc.lineAt(pos); // Get the current line of text
// 	console.log(update.changes)
//
// });


// Update listener to check if user is typing inside a decoration
const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
	if (!update.docChanged) return;

	const state = update.state;
	const pos = state.selection.main.head;

	if (isCursorInsideDecoration(state, pos)) {
		console.log("Cursor is inside a marked word.");
	} else {
		console.log("Cursor is in plain text.");
	}
});


//
// Function to check if cursor is inside a decoration
function isCursorInsideDecoration(state: EditorState, pos: number): boolean {
	const decorations = state.field(highlightField, false);
	if (!decorations) return false;

	let found = false;
	decorations.between(pos, pos, () => {
		found = true;
		return false; // Stop searching once we find a decoration
	});

	return found;
}
//
//
