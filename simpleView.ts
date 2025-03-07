
import LangsoftPlugin from 'main';
import { ViewUpdate, PluginValue, EditorView, ViewPlugin, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state"

// Define a decoration
const highlightDecoration = Decoration.mark({ class: "known" });

// Dummy data for highlights
const dummyHighlightData = {
	highlights: [
		{ from: 5, to: 20 },
		{ from: 30, to: 40 },
		{ from: 50, to: 60 }
	]
};

// Sleep function to simulate API call delay
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to simulate fetching data from an API with a delay
async function fetchHighlightData() {
	await sleep(1000); // Simulate a 1 second delay
	return dummyHighlightData;
}

// Function to generate decorations based on the fetched data
async function getDecorations(view: EditorView, plugin: LangsoftPlugin) {
	const data = await fetchHighlightData();
	const ranges = [];
	for (const { from, to } of data.highlights) {
		ranges.push(highlightDecoration.range(from, to));
	}
	return Decoration.set(ranges);
}

// Effect to update decorations
const setDecorations = StateEffect.define();

// State field to hold decorations
export const decorationField = StateField.define({
	create() {
		return Decoration.none;
	},
	update(decorations, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setDecorations)) {
				decorations = effect.value;
			}
		}
		return decorations;
	},
	provide: field => EditorView.decorations.from(field)
});

// Plugin to handle asynchronous updates
export const testPlugin = (plugin: LangsoftPlugin) => {
	return ViewPlugin.fromClass(
		class testPlugin {
			constructor(view: EditorView) {
				this.updateDecorations(view);
			}

			async updateDecorations(view: EditorView) {
				const decorations = await getDecorations(view, plugin);
				console.log(view.visibleRanges)
				view.dispatch({
					effects: setDecorations.of(decorations)
				});
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					// It seems that if the document changes, then the viewport will have automatically changed too

					console.log(`did the viewport change? ${update.viewportChanged}`)
					console.log(`did the document change? ${update.docChanged}`)


					this.updateDecorations(update.view);

				}
			}

		}
	);
};



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
