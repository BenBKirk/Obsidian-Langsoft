import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import LangsoftPlugin from 'main';
// import { buildTextDecorations } from '@app/editor/live-preview/decorations';


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

async function fakeDatabaseLookup(line:String): Promise<DecorationSpec[]> {
    await this.plugin

   let results: DecorationSpec[] = [];
    for (let item of words) {
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
       }}
   
   return results;
}

function getAllDecosByLine(view: EditorView, plugin: LangsoftPlugin) {
   const widgets:{[lineNumber: number]: DecorationSpec[]} = {};
   for (const visibleRange of view.visibleRanges) {
       const startLine = view.state.doc.lineAt(visibleRange.from).number;
       const endLine = view.state.doc.lineAt(visibleRange.to).number;

       for (let i = startLine; i <= endLine; i++) {
           widgets[i] = getDecosOnLine(view, i,plugin);
       }
   }
   return widgets;
}


async function getDecosOnLine(view: EditorView, lineNumber: number, plugin: LangsoftPlugin) {
    const widgets = [];
    const line = view.state.doc.line(lineNumber);
    const docText = view.state.sliceDoc(line.from, line.to);
    const words = getWordsFromLine(docText)
    for (let word of words) {
        if (await plugin.dictionaryManager.isWordInDict(word.word)) {
            widgets.push(
                {
                    KnownLevel: "known",
                    start: word.startPosInLine,
                    end: word.endPosInLine
                }
            )
        }
    }
    return widgets;
}


function decoSpecByLineToDecorationSet(view: EditorView, decorationsByLine: {[lineNumber: number]: DecorationSpec[]}) {
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



export const buildHighlightPlugin = (plugin: LangsoftPlugin) => {
  return ViewPlugin.fromClass(
    class highlightPlugin {
      decorations: DecorationSet;
      decoSpecByLine: {[lineNumber: number]: DecorationSpec[]};
      plugin: LangsoftPlugin;

      constructor(view: EditorView) {
        this.plugin = plugin;
        // this.decorations = buildTextDecorations(view, plugin);
        this.decoSpecByLine = getAllDecosByLine(view,this.plugin);
        this.decorations = decoSpecByLineToDecorationSet(view, this.decoSpecByLine);
      }

      update(update: ViewUpdate) {

        if (update.docChanged) {
            // Performance:
            // When the user is typing, only re-generate decorations for the current line
            if (stillSameNumberOfLines(update)) {
                //only update the line that was edited
                // for example the user is just typing
                let lineThatChanged = getLineThatChanged(update);
                this.decoSpecByLine[lineThatChanged] = getDecosOnLine(update.view, lineThatChanged,this.plugin);
                this.decorations = decoSpecByLineToDecorationSet(update.view, this.decoSpecByLine);
            } else {
                // more than one line was changed in doc
                // reload all lines
                this.decoSpecByLine = getAllDecosByLine(update.view,this.plugin);
                this.decorations = decoSpecByLineToDecorationSet(update.view, this.decoSpecByLine);
            }
        }
    }
        // this.decorations = buildTextDecorations(update.view, this.plugin);


      
    },
    {
      decorations: (v) => v.decorations,
      // provide: (plugin) =>
      //   EditorView.atomicRanges.of((view) => {
      //     const value = view.plugin(plugin);
      //     return value ? value.decorations : Decoration.none;
        }),
    },
  );
};

