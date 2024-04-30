import { EditorView, ViewUpdate, Decoration, DecorationSet, ViewPlugin } from "@codemirror/view";
// import nlp from "compromise";
// import CompromiseView from "compromise/types/view/one";
import LangsoftPlugin from "main";
import { Plugin } from "obsidian";


export interface DecorationSpec {
    knownLevel: string,
    // Start and end are measured from the start of the *line* the decoration is on
    start: number,
    end: number
}

export interface WordPositions {
    word: string,
    startPosInLine: number,
    endPosInLine: number
}

function getWordsFromLine(text: string): WordPositions[] {
    if (!text) {
        return [];
    }

    let words: WordPositions[] = [];
    let trimmedText = text.trim();
    let wordRegex = /\b\w+\b/g;
    let match;
    while ((match = wordRegex.exec(trimmedText)) !== null) {
        words.push({
            word: match[0],
            startPosInLine: match.index,
            endPosInLine: match.index + match[0].length
        });
    }

    return words;
}

function fakeDatabaseLookup(words: WordPositions[]): DecorationSpec[] {
    let results: DecorationSpec[] = [];

    for (let item of words) {
        if (item.word == "Ben") { // if it were in the database           
            results.push({
                knownLevel:"known",
                start:item.startPosInLine,
                end:item.endPosInLine
            });
        } else if (item.word == "Tabea") {
            results.push({
                knownLevel: "unknown",
                start:item.startPosInLine,
                end:item.endPosInLine
            })

        }
    }
    console.log(results)
    return results;
}


function getAllDecosByLine(view: EditorView) {

    const widgets:{[lineNumber: number]: DecorationSpec[]} = {};

    for (const visibleRange of view.visibleRanges) {
        const startLine = view.state.doc.lineAt(visibleRange.from).number;
        const endLine = view.state.doc.lineAt(visibleRange.to).number;

        for (let i = startLine; i <= endLine; i++) {
            widgets[i] = getDecosOnLine(view, i);
        }
    }

    // console.log(widgets)
    return widgets;
}


function getDecosOnLine(view: EditorView, lineNumber: number) {
	const widgets = [];

    const line = view.state.doc.line(lineNumber);
    const docText = view.state.sliceDoc(line.from, line.to);
    

    // const doc = nlp(docText);
    // const wordsToHighlight: { [partOfSpeech: string]: CompromiseView }  = {};
    // 
    // 
    const words = getWordsFromLine(docText)
    
    // lookup in database ....
    return fakeDatabaseLookup(words);

    

    //         widgets.push({partOfSpeech: truePartOfSpeech, start: start, end: end})
    //     }
    // }
    //
    // widgets.push({partOfSpeech:"known", start: 0, end: 5})

	// return widgets;
}


function decosByLineToDecorationSet(view: EditorView, decorationsByLine: {[lineNumber: number]: DecorationSpec[]}) {

    
    const allWidgets = [];

    // Add lineStart to each of the decorations' positions
    // And return the resulting widgets

    for (const lineNumberStr of Object.keys(decorationsByLine)) {
        const lineNumber = parseInt(lineNumberStr);
        const widgets = decorationsByLine[lineNumber];
        const lineStart = view.state.doc.line(lineNumber).from;

        

        const offsetWidgets = widgets.map((decoSpec => {
            return Decoration.mark({ inclusive: true, attributes: {}, class: decoSpec.knownLevel }).range(decoSpec.start + lineStart, decoSpec.end + lineStart);
        }));
        allWidgets.push(...offsetWidgets);
    }


    return Decoration.set(allWidgets, true);
}


export const LangsoftViewPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    decorationsByLine: {[lineNumber: number]: DecorationSpec[]};

    constructor(view: EditorView) {
        this.decorationsByLine = getAllDecosByLine(view);
        this.decorations = decosByLineToDecorationSet(view, this.decorationsByLine);
    }

    getLineThatChanged(update: ViewUpdate): number {
        let changedLineNumber = 0; // Initialize to null in case no lines are changed

        // Iterate over changed ranges and update changedLineNumber
        update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            changedLineNumber = update.view.state.doc.lineAt(toB).number;
        });

        return changedLineNumber; // Return the line number
    }

    stillSameNumberOfLines(update:ViewUpdate) {
       return update.startState.doc.lines === update.state.doc.lines;
    }

    getTextFromLineNumber(update:ViewUpdate,lineNumber: number) {
        const line = update.state.doc.line(lineNumber);
        const lineText = update.state.sliceDoc(line.from, line.to);
        return lineText;
    }

    update(update: ViewUpdate) {
        let shouldRegenerateAllDecorations = false;

        if (update.docChanged) {
            // Performance:
            // When the user is typing, only re-generate decorations for the current line
            if (this.stillSameNumberOfLines(update)) {
                //only update the line that was edited
                // for example the user is just typing
                let lineThatChanged = this.getLineThatChanged(update);
                // let lineText = this.getTextFromLineNumber(update,lineThatChanged)
                
                this.decorationsByLine[lineThatChanged] = getDecosOnLine(update.view, lineThatChanged);
                this.decorations = decosByLineToDecorationSet(update.view, this.decorationsByLine);

            } else {
                // more than one line was changed in doc
                // reload all lines
                this.decorationsByLine = getAllDecosByLine(update.view);
                this.decorations = decosByLineToDecorationSet(update.view, this.decorationsByLine);
                
            }
        }
    }

}, { decorations: v => v.decorations, });









// import { syntaxTree } from "@codemirror/language";
// import { RangeSetBuilder } from "@codemirror/state";
// import {
//     Decoration,
//     DecorationSet,
//     EditorView,
//     PluginSpec,
//     PluginValue,
//     ViewPlugin,
//     ViewUpdate,
//     WidgetType,
//     lineNumbers,
// } from "@codemirror/view";
//
//
// export interface DecorationSpec {
//     partOfSpeech: string,
//     start: number,
//     end: number
// }
//
// export interface WordPositions {
//     word: string,
//     startPosInLine: number,
//     endPosInLine: number
// }
//
// function getWordsFromLine(text: string): WordPositions[] {
//     if (!text) {
//         return [];
//     }
//
//     let words: WordPositions[] = [];
//     let trimmedText = text.trim();
//     let wordRegex = /\b\w+\b/g;
//     let match;
//     while ((match = wordRegex.exec(trimmedText)) !== null) {
//         words.push({
//             word: match[0],
//             startPosInLine: match.index,
//             endPosInLine: match.index + match[0].length
//         });
//     }
//
//     return words;
// }
//
//
// class LangsoftViewPlugin implements PluginValue {
//     decorations: DecorationSet;
//     // decorationsByLine: {[lineNumber: number]: DecorationSpec[]};
//
//     constructor(view: EditorView) {
//         this.decorations = this.buildDecorations(view);
//         // this.decorationsByLine = getAllDecosByLine(view);
//         // this.decorations = decosByLineToDecorationSet(view, this.decorationsByLine)
//     }
//
//
    // getLineThatChanged(update: ViewUpdate): number {
    //     let changedLineNumber = 0; // Initialize to null in case no lines are changed
    //
    //     // Iterate over changed ranges and update changedLineNumber
    //     update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    //         changedLineNumber = update.view.state.doc.lineAt(toB).number;
    //     });
    //
    //     return changedLineNumber; // Return the line number
    // }
    //
    // stillSameNumberOfLines(update:ViewUpdate) {
    //    return update.startState.doc.lines === update.state.doc.lines;
    // }
    //
    // getTextFromLineNumber(update:ViewUpdate,lineNumber: number) {
    //     const line = update.state.doc.line(lineNumber);
    //     const lineText = update.state.sliceDoc(line.from, line.to);
    //     return lineText;
    // }
//
//
//     update(update: ViewUpdate) {
//
//         //first check if the text changed, if not then maybe the user clicked on something, otherwise it doesn't really matter what the update was
//         if (update.docChanged) {
//             //which lines 
//             if (this.stillSameNumberOfLines(update)) {
//                 //only update the line that was edited
//                 // for example the user is just typing
//                 let lineThatChanged = this.getLineThatChanged(update);
//                 let lineText = this.getTextFromLineNumber(update,lineThatChanged)
//                 // Loop through each word and look it up in the database
//                 // Get a list of objects with the start and end location along with what highlighting needs to be applied
//                 //
//                 // 
//                 // let parser = new WordParser(lineText);
//                 // let words = getWordsFromLine(lineText);
//                 // console.log(words);
//
//
//             } else {
//                 //more than one line was edited
//                 //update all lines
//             }
//         }        
//
//         // // console.log('selection changed',update.selectionSet.valueOf)
//
//         // let cursorPos = update.state.selection.main.head;
//         // // console.log(cursorPos)
//         // if (update.selectionSet) {
//         //     let wordClickedStart = update.state.wordAt(cursorPos)?.from;
//         //     let wordClickedEnd = update.state.wordAt(cursorPos)?.to;
//         //     // get word that was clicked on
//         //     if (wordClickedStart != undefined && wordClickedEnd != undefined) {
//         //         console.log(update.state.doc.sliceString(wordClickedStart, wordClickedEnd))
//         //     this.decorations = this.buildDecorations(update.view, wordClickedStart,wordClickedEnd);
//         //
//         //     } else {
//         //         let wordClickedStart = 0
//         //         let wordClickedEnd = 0
//         //     }
//         //
//         //     // if (update.docChanged || update.viewportChanged) {
//         //     //     this.decorations = this.buildDecorations(update.view, wordClickedStart,wordClickedEnd);
//         //     // }
//         // }
//
//     }
//
//     destroy() { }
//
//     buildDecorations(view: EditorView): DecorationSet {
//         const builder = new RangeSetBuilder<Decoration>();
//
//         for (let { from, to } of view.visibleRanges) {
//           syntaxTree(view.state).iterate({
//             from,
//             to,
//             enter(node) {
//               if (node.type.name.startsWith("list")) {
//                 // Position of the '-' or the '*'.
//                 const listCharFrom = node.from - 2;
//
//                 // builder.add(
//                 //   listCharFrom,
//                 //   listCharFrom + 1,
//                 //   Decoration.replace({
//                 //     widget: new EmojiWidget(),
//                 //   })
//                 // );
//               }
//             },
//           });
//         }
//
//         return builder.finish();
//       }
//
// }
//
// const pluginSpec: PluginSpec<LangsoftViewPlugin> = {
//     decorations: (value: LangsoftViewPlugin) => value.decorations,
// };
//
// export const langsoftViewPlugin = ViewPlugin.fromClass(
//     LangsoftViewPlugin,
//     pluginSpec
// );
//
//
