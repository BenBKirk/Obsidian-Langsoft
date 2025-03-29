
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

		// for (const word of words) {
		// 	const entry = await this.plugin.dictManager.searchUserDict(word.text)
		// 	if (entry) {
		// 		if (!entry.deleted) {
		// 			// const recentContext = this.plugin.dictManager.findMostRecentContextFromEntry(entry);
		// 			// const fam = recentContext.level;
		// 			const highlightLevel = this.plugin.dictManager.findMostRecentHighlightLevel(entry);
		//
		// 			view.dispatch({ effects: highlightEffect.of({ class: highlightLevel, from: word.from, to: word.to }) });
		// 		}
		// 	}
		// }

		console.log("searching")
		for (const [index, word] of words.entries()) {
			const result = this.plugin.dictManager.userDict[word.text];
			if (result) {
				if (!result.deleted) {

					view.dispatch({ effects: highlightEffect.of({ class: result.highlight, from: word.from, to: word.to }) });
				}
				for (const phrase of result.firstwordofphrase) {
					const parts = phrase.match(regex);
					const lookAhead = [];
					let end = 0;
					for (let i = 0; i < parts.length; i++) {
						lookAhead.push(words[index + i].text);
						if (i === parts?.length - 1) {
							end = words[index + i].to
						}
					}
					if (lookAhead.join(" ") === parts.join(" ")) {
						console.log("phrase found")
						console.log("start: ", word.from)
						console.log("end: ", end)
						//look up phrase in dict
						const phraseResult = this.plugin.dictManager.userDict[phrase];
						console.log(phraseResult.highlight)
						view.dispatch({ effects: highlightEffect.of({ class: "knownunderline", from: word.from, to: end }) });

					}

				}
			}
		}
		console.log("done")
	}


	async removeAllHightlights(view: EditorView) {
		view.dispatch({ effects: removeAllDecorationsEffect.of() });
	}
}



