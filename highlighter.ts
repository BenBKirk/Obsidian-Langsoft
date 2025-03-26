
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, ViewUpdate } from "@codemirror/view";
import LangsoftPlugin from "main";

// Define an effect to trigger decoration updates
// Needs to be outside the class properties
const highlightEffect = StateEffect.define<{ class: string; from: number; to: number }>();
const removeAllDecorationsEffect = StateEffect.define<void>();

export class Highlighter {
	plugin: LangsoftPlugin;

	constructor(plugin: LangsoftPlugin) {
		this.plugin = plugin
	}
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
				if (effect.is(highlightEffect)) {
					const mark = Decoration.mark({
						inclusive: true,
						attributes: {},
						class: effect.value.class,
					}).range(effect.value.from, effect.value.to);

					deco = deco.update({ add: [mark] });
				} else if (effect.is(removeAllDecorationsEffect)) {
					deco = Decoration.none;
				}
			}
			return deco;
		},
		provide: (f) => EditorView.decorations.from(f),
	});


	async highlightAllWords(view: EditorView) {
		const words: { text: string; from: number; to: number }[] = [];
		const text = view.state.doc.toString();
		const regex = /\b\w+\b/g;
		let match;

		while ((match = regex.exec(text)) !== null) {
			words.push({ text: match[0], from: match.index, to: match.index + match[0].length });
		}

		for (const word of words) {
			const entry = await this.plugin.dictManager.searchUserDict(word.text)
			if (entry) {
				if (!entry.deleted) {
					const recentContext = this.plugin.dictManager.findMostRecentContextFromEntry(entry);
					const fam = recentContext.level;
					view.dispatch({ effects: highlightEffect.of({ class: fam, from: word.from, to: word.to }) });
				}
			}
		}
	}

	async removeAllHightlights(view: EditorView) {
		// console.log("clearrrrrring")
		view.dispatch({ effects: removeAllDecorationsEffect.of() });
	}
}



