
import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
} from '@codemirror/view';
import LangsoftPlugin from "main";
import type { DictionaryData } from "dictionaries";
import { termKey } from "words";
import { maskNonProse } from "prose";
import { StateField, StateEffect } from "@codemirror/state";

// Define an effect to signal updates
export const TriggerEffect = StateEffect.define<null>();


// Define a field that changes when TriggerEffect is dispatched
export const TriggerField = StateField.define<number>({
	create() {
		return 0;
	},
	update(value, tr) {
		for (const e of tr.effects) {
			if (e.is(TriggerEffect)) return value + 1; // increment
		}
		return value;
	}
});

/** True if refreshHighlights() was called in this update. */
export function wasTriggered(update: ViewUpdate): boolean {
	return update.startState.field(TriggerField) !== update.state.field(TriggerField);
}



export function createHighlightPlugin(plugin: LangsoftPlugin) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet;
			plugin: LangsoftPlugin;

			constructor(view: EditorView) {
				this.plugin = plugin; // reference to main plugin
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || wasTriggered(update)) {
					// if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				for (const { from, to } of view.visibleRanges) {
					// not links' targets, embedded recordings, tags… (positions stay the same)
					const text = maskNonProse(view.state.doc.sliceString(from, to));
					const words = this.plugin.parseIntoWords(text, from);
					for (const [index, word] of words.entries()) {
						this.highlightWord(builder, word, words, index);
					}
				}
				return builder.finish();
			}

			private highlightWord(
				builder: RangeSetBuilder<Decoration>,
				word: { text: string; from: number; to: number },
				words: { text: string; from: number; to: number }[],
				index: number
			) {
				const dict = this.plugin?.dictManager?.userDict;
				const key = termKey(word.text);
				const result = dict?.[key];

				// coworkers' words: blue only if the word isn't in your dictionary at all
				let markedCoworker = false;
				for (const otherDict of Object.values(this.plugin.dictManager.otherDicts ?? {})) {
					const otherresult = otherDict?.[key];
					if (!otherresult) continue;
					if (!result && !markedCoworker && otherresult.highlight != "None") {
						builder.add(word.from, word.to, Decoration.mark({ class: "coworker" }));
						markedCoworker = true;
					}
					if (Array.isArray(otherresult.firstwordofphrase)) {
						for (const phrase of otherresult.firstwordofphrase) {
							this.highlightPhrase(builder, phrase, words, index, true, otherDict);
						}
					}
				}

				if (!result) return;
				// Highlight the single word
				builder.add(word.from, word.to, Decoration.mark({ class: result.highlight }));

				// Highlight any matching phrases
				if (Array.isArray(result.firstwordofphrase)) {
					for (const phrase of result.firstwordofphrase) {
						this.highlightPhrase(builder, phrase, words, index, false, dict);
					}
				}

			}

			private highlightPhrase(
				builder: RangeSetBuilder<Decoration>,
				phrase: string,
				words: { text: string; from: number; to: number }[],
				index: number,
				iscoworker: boolean,
				dict: DictionaryData
			) {
				if (!phrase) return;
				// const regex = /\b\w+\b/g;
				const parts = this.plugin.parseIntoWords(termKey(phrase), 0)
				// const regex = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;
				// const parts = phrase.match(regex);
				if (!parts) return;

				const lookAhead: string[] = [];
				const reconstructedPhrase: string[] = [];
				let end = 0;


				for (let i = 0; i < parts.length; i++) {
					reconstructedPhrase.push(parts[i].text)
					const nextWord = words[index + i];
					if (!nextWord) {
						lookAhead.length = 0;
						break;
					}
					lookAhead.push(termKey(nextWord.text));
					if (i === parts.length - 1) {
						end = nextWord.to;
					}
				}


				if (lookAhead.length && lookAhead.join(" ") === reconstructedPhrase.join(" ")) {
					// const dict = this.plugin?.dictManager?.userDict;
					const phraseResult = dict?.[phrase];
					if (phraseResult) {
						if (iscoworker) {
							// as for single words: only phrases you don't have, and that the coworker has a level for
							if (phraseResult.highlight === "None" || this.plugin.dictManager.userDict?.[phrase]) return;
							builder.add(
								words[index].from,
								end,
								Decoration.mark({ class: "coworkerunderline" })
							);

						} else {
							builder.add(
								words[index].from,
								end,
								Decoration.mark({ class: `${phraseResult.highlight}underline` })
							);

						}
					}
				}

			}
		},
		{
			decorations: v => v.decorations,
		}
	);
}


export function createSelectionHighlightPlugin(plugin: LangsoftPlugin) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet;
			plugin: LangsoftPlugin;

			constructor(view: EditorView) {
				this.plugin = plugin; // reference to main plugin
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || wasTriggered(update)) {
					// if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
					// console.log(update.state.selection.ranges[0])
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				// for (const { from, to } of view.visibleRanges) {
				// 	const text = view.state.doc.sliceString(from, to);
				// 	const words = this.plugin.parseIntoWords(text, from);
				// 	for (const [index, word] of words.entries()) {
				// 		this.highlightWord(builder, word, words, index);
				// 	}
				// }
				if (this.plugin.SelectedText.length > 0) {
					if (view.state.doc.length > this.plugin.SelectedText[1]) { // would be out of bounds

						const highlight = Decoration.mark({
							attributes: { style: "outline: 5px solid rgba(255,0,0,0.3);" },
						});
						builder.add(this.plugin.SelectedText[0], this.plugin.SelectedText[1], highlight);

					} else {
						this.decorations = Decoration.none;
					}
				}


				return builder.finish();
			}

			destroy() {
				this.decorations = Decoration.none;
			}

		},
		{
			decorations: v => v.decorations,
		}
	);
}
