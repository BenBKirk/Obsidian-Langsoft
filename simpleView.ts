
import { debounce } from 'obsidian';
import LangsoftPlugin from 'main';
import { ViewUpdate, PluginValue, EditorView, ViewPlugin, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, Transaction } from "@codemirror/state"

export interface WordPositions {
	word: string,
	startPosInLine: number,
	endPosInLine: number
}

export interface DecorationSpec {
	knownLevel: string,
	// Start and end are measured from the start of the *line* the decoration is on
	start: number,
	end: number
}

async function getWordsFromLine(text: string): Promise<WordPositions[]> {
	if (!text) {
		return [];
	}
	const words: WordPositions[] = [];
	const wordRegex = /\b\w+\b/g;
	let match;
	while ((match = wordRegex.exec(text)) !== null) {
		words.push({
			word: match[0],
			startPosInLine: match.index,
			endPosInLine: match.index + match[0].length
		});
	}
	return words;
}

// Define a decoration
const highlightDecoration = Decoration.mark({ class: "known" });

// Effect to update decorations
const setDecorations = StateEffect.define<DecorationSet>();

// State field to hold decorations
export const decorationField = StateField.define<DecorationSet>({
	create(): DecorationSet {
		return Decoration.none;
	},
	update(decorations: DecorationSet, transaction: Transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setDecorations)) {
				decorations = effect.value;
			}
		}
		return decorations;
	},
	provide: field => EditorView.decorations.from(field)
});

// Function to generate decorations based on the fetched data
async function getDecorations(view: EditorView, plugin: LangsoftPlugin) {
	const { from, to } = view.viewport; // ✅ Get the visible range
	const visibleText = view.state.doc.sliceString(from, to); // ✅ Extract visible text
	// const test = await getBenHighlightData(visibleText)
	// const visibleText = view.state.doc.toString();
	const words = await getWordsFromLine(visibleText)

	const ranges = [];
	for (const word of words) {
		// if (word.word == "Ben") {
		if (await plugin.dictionaryManager.isWordInDict(word.word)) {
			// await sleep(100)
			ranges.push(highlightDecoration.range(word.startPosInLine, word.endPosInLine))
		}
	}
	return Decoration.set(ranges);

}

// async function getLine(view: EditorView) {
// 	return view.state.doc
// }

async function updateDecorations(view: EditorView, plugin: LangsoftPlugin) {
	const decorations = await getDecorations(view, plugin);
	view.dispatch({
		effects: setDecorations.of(decorations)
	});
}

const debouncedUpdate = debounce((view: EditorView, plugin: LangsoftPlugin) => updateDecorations(view, plugin), 500, true);


// Plugin to handle asynchronous updates
export const testPlugin = (plugin: LangsoftPlugin) => {
	return ViewPlugin.fromClass(
		class testPlugin {
			constructor(view: EditorView) {
				// this.dictionaryManager = plugin.dictionaryManager
				// this.updateDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					// It seems that if the document changes, then the viewport will have automatically changed too
					console.log(update.view.viewport.from)
					console.log(update.view.viewport.to)

					// console.log(`did the viewport change? ${update.viewportChanged}`)
					// console.log(`did the document change? ${update.docChanged}`)

					// updateDecorations(update.view, plugin);
					// debouncedUpdate(update.view, plugin)

				}
			}

		}
	);
};

// -------------------------------------

// Too scared to delete this for now
//
// function isTypingOrBackspacing(update:ViewUpdate): boolean {
//   // try to find out is the user is typing or backspacing (one character different)
//   let sizeOfChange = update.changes.newLength - update.changes.length
//   if (sizeOfChange === 1 || sizeOfChange === -1) {
//     return true
//   } else {
//     return false
//   }
// }

// function isNewWordOnCurrentLine(update:ViewUpdate) :boolean {
//   // try to find out if a new word has been typed yet. (count number of words on line)
//   const currentLine = getCurrentLineFromUpdate(update);
//   if (currentLine === 0) {
//     return false // no current line
//   }
//   const oldLine = update.startState.doc.line(currentLine);
//   const newLine = update.state.doc.line(currentLine);
//   const oldLineText = update.startState.sliceDoc(oldLine.from,oldLine.to);
//   const newLineText = update.state.sliceDoc(newLine.from,newLine.to);
//   const oldStateWordCount = countWordsOnLine(oldLineText);
//   const newStateWordCount = countWordsOnLine(newLineText);
//   if (newStateWordCount > oldStateWordCount) {
//     return true
//   } else {
//     return false
//   }
// }


// function getCurrentLineFromUpdate(update:ViewUpdate) {
//   let currentLine = 0;
//   update.changes.iterChangedRanges((fromA,toA,fromB,toB) => {
//     currentLine = update.view.state.doc.lineAt(toB).number;
//   });
//   return currentLine;
// }

// function countWordsOnLine(lineStr:string):number {
//   console.log(lineStr);
//   let words = [];
//   let wordRegex = /\b\w+\b/g;
//   let match;
//   while ((match = wordRegex.exec(lineStr)) !==null) {
//     words.push(match[0]);
//   }
//   return words.length;
// }
