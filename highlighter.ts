
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, ViewUpdate } from "@codemirror/view";

export class Highlighter {
	// Define an effect to trigger decoration updates
	highlightEffect = StateEffect.define<{ from: number; to: number }>();
	// Define a StateField to manage decorations
	highlightField = StateField.define<DecorationSet>({
		create() {
			return Decoration.none;
		},
		update(deco, tr) {
			// Apply existing decorations to the new state
			deco = deco.map(tr.changes);
			// Apply effects (e.g., adding a highlight)
			for (const effect of tr.effects) {
				if (effect.is(this.highlightEffect)) {
					console.log(effect.value)
					const mark = Decoration.mark({ class: "cm-highlight" });
					deco = deco.update({ add: [mark.range(effect.value.from, effect.value.to)] });
				}
			}
			return deco;
		},
		provide: (f) => EditorView.decorations.from(f),
	});


	highlightAllWords(view: EditorView) {
		const words: { text: string; from: number; to: number }[] = [];
		const text = view.state.doc.toString();
		const regex = /\b\w+\b/g;
		let match;

		while ((match = regex.exec(text)) !== null) {
			words.push({ text: match[0], from: match.index, to: match.index + match[0].length });
		}

		for (const word of words) {
			if (word.text === "Ben") {
				view.dispatch({ effects: this.highlightEffect.of({ from: word.from, to: word.to }) });
			}
		}
	}


}

