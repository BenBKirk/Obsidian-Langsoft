import { EditorView, ViewUpdate, Decoration, DecorationSet, ViewPlugin } from "@codemirror/view";

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


function getLineThatChanged(update: ViewUpdate): number {
        let changedLineNumber = 0; // Initialize to null in case no lines are changed
        // Iterate over changed ranges and update changedLineNumber
        update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            changedLineNumber = update.view.state.doc.lineAt(toB).number;
        });
        return changedLineNumber; // Return the line number
    }

function stillSameNumberOfLines(update:ViewUpdate) {
       return update.startState.doc.lines === update.state.doc.lines;
    }

function getTextFromLineNumber(update:ViewUpdate,lineNumber: number) {
        const line = update.state.doc.line(lineNumber);
        const lineText = update.state.sliceDoc(line.from, line.to);
        return lineText;
    }

function getWordsFromLine(text: string): WordPositions[] {
       if (!text) {
           return [];
       }
       let words: WordPositions[] = [];
       let wordRegex = /\b\w+\b/g;
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

function fakeDatabaseLookup(words: WordPositions[]): DecorationSpec[] {

       let results: DecorationSpec[] = [];
        for (let item of words) {
           if (item.word == "Ben") { // if it were in the database           

               results.push({
                   knownLevel:"known",
                   start:item.startPosInLine,
                   end:item.endPosInLine
               });
           }
           if (item.word == "Tabea") {
               results.push({
                   knownLevel: "unknown",
                   start:item.startPosInLine,
                   end:item.endPosInLine
               });
           }
           if (item.word == "and") {
               results.push({
                   knownLevel: "semiknown",
                   start:item.startPosInLine,
                   end:item.endPosInLine
               });
           }
       }
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
       return widgets;
   }


function getDecosOnLine(view: EditorView, lineNumber: number) {
       const line = view.state.doc.line(lineNumber);
       const docText = view.state.sliceDoc(line.from, line.to);
       const words = getWordsFromLine(docText)
        // lookup in database ....
       return fakeDatabaseLookup(words);
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


    update(update: ViewUpdate) {
        if (update.docChanged) {
            // Performance:
            // When the user is typing, only re-generate decorations for the current line
            if (stillSameNumberOfLines(update)) {
                //only update the line that was edited
                // for example the user is just typing
                let lineThatChanged = getLineThatChanged(update);
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


}, { decorations: v => v.decorations,provide: (plugin) => EditorView.atomicRanges.of((view) => {
        const value = view.plugin(plugin);
        return value ? value.decorations : Decoration.none;
    })});

