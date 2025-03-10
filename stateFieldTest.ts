import { Editor, Plugin } from "obsidian";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";

export default class HighlightPlugin extends Plugin {
	async onload() {
		console.log("Highlight Plugin loaded");

		// Register the highlight extension in CodeMirror
		this.registerEditorExtension(highlightField);

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

