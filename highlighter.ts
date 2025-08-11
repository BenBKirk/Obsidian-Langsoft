
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
				if (update.docChanged || update.viewportChanged || update.state.field(TriggerField)) {
					// if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();

				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);
					const words = this.extractWords(text, from);

					for (const [index, word] of words.entries()) {
						this.highlightWord(builder, word, words, index);
					}
				}

				return builder.finish();
			}

			private extractWords(text: string, offset: number) {
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

			private highlightWord(
				builder: RangeSetBuilder<Decoration>,
				word: { text: string; from: number; to: number },
				words: { text: string; from: number; to: number }[],
				index: number
			) {
				const dict = this.plugin?.dictManager?.userDict;
				const result = dict?.[word.text.trim().toLowerCase()];

				if (!result || result.deleted) return;

				// Highlight the single word
				builder.add(word.from, word.to, Decoration.mark({ class: result.highlight }));

				// Highlight any matching phrases
				if (Array.isArray(result.firstwordofphrase)) {
					for (const phrase of result.firstwordofphrase) {
						this.highlightPhrase(builder, phrase, words, index, result.highlight);
					}
				}
			}

			private highlightPhrase(
				builder: RangeSetBuilder<Decoration>,
				phrase: string,
				words: { text: string; from: number; to: number }[],
				index: number,
				baseHighlight: string
			) {
				if (!phrase) return;
				// const regex = /\b\w+\b/g;
				const regex = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;
				const parts = phrase.match(regex);
				if (!parts) return;

				const lookAhead: string[] = [];
				let end = 0;

				for (let i = 0; i < parts.length; i++) {
					const nextWord = words[index + i];
					if (!nextWord) {
						lookAhead.length = 0;
						break;
					}
					lookAhead.push(nextWord.text);
					if (i === parts.length - 1) {
						end = nextWord.to;
					}
				}

				if (lookAhead.length && lookAhead.join(" ") === parts.join(" ")) {
					const dict = this.plugin?.dictManager?.userDict;
					const phraseResult = dict?.[phrase];
					if (phraseResult) {
						builder.add(
							words[index].from,
							end,
							Decoration.mark({ class: `${phraseResult.highlight}underline` })
						);
					}
				}

			}
		},
		{
			decorations: v => v.decorations,
		}
	);
}


