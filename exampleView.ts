
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import LangsoftPlugin from 'main';
import { App } from 'obsidian';
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



export const buildExampleViewPlugin = (plugin: LangsoftPlugin) => {
  return ViewPlugin.fromClass(
    class highlightPlugin {
      decorations: DecorationSet;
    decorationsByLine: {[lineNumber: number]: DecorationSpec[]};
      plugin: LangsoftPlugin;

      constructor(view: EditorView) {
        this.plugin = plugin;
        this.decorationsByLine = this.getAllDecosByLine(view);
        this.decorations = this.decosByLineToDecorationSet(view, this.decorationsByLine);

      }

      update(update: ViewUpdate) {

        if (update.viewportChanged) {
          //update all lines
          this.decorationsByLine = this.getAllDecosByLine(update.view);
          this.decorations = this.decosByLineToDecorationSet(update.view, this.decorationsByLine);
          return // return early
        }

        

        if (update.docChanged) {
            // Performance:
            // When the user is typing for example, only re-generate decorations for the current line
            if (update.startState.doc.lines === update.state.doc.lines) { // number of lines hasn't changed, so just update the line being changed.

              update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
              let lineThatChanged = update.view.state.doc.lineAt(toB).number;
              this.decorationsByLine[lineThatChanged] = this.getDecosOnLine(update.view, lineThatChanged);
              this.decorations = this.decosByLineToDecorationSet(update.view, this.decorationsByLine);
              });
            } else { //number of lines has changed (bigger change then just typing..)
                this.decorationsByLine = this.getAllDecosByLine(update.view);
                this.decorations = this.decosByLineToDecorationSet(update.view, this.decorationsByLine);
            }
        } 
    }
        // this.decorations = buildTextDecorations(update.view, this.plugin);

      getAllDecosByLine(view: EditorView) {

        const widgets:{[lineNumber: number]: DecorationSpec[]} = {};
        for (const visibleRange of view.visibleRanges) {
            const startLine = view.state.doc.lineAt(visibleRange.from).number;
            const endLine = view.state.doc.lineAt(visibleRange.to).number;

            for (let i = startLine; i <= endLine; i++) {
                widgets[i] = this.getDecosOnLine(view, i);
            }
        }

        return widgets;
      }


      getDecosOnLine(view: EditorView, lineNumber: number):DecorationSpec[] {
        const line = view.state.doc.line(lineNumber);
        const docText = view.state.sliceDoc(line.from, line.to);
        const wordsFromLineWithPos = this.getWordsFromLine(docText);
        let wordsToHighlight:DecorationSpec[] = [];
        if (wordsFromLineWithPos.length < 1) {
          return wordsToHighlight //return early with empty list
        }
        if (this.plugin.dictionaryManager.smallWordnet === undefined) {
          return wordsToHighlight //return early with empty list (small Dict is not defined yet)
        }

        for (let word of wordsFromLineWithPos) {
          if (this.plugin.dictionaryManager.isWordInSmallDict(word.word)){
              wordsToHighlight.push({knownLevel:"known",start:word.startPosInLine,end:word.endPosInLine})
          }
        }
        return wordsToHighlight
      }

      decosByLineToDecorationSet(view: EditorView, decorationsByLine: {[lineNumber: number]: DecorationSpec[]}):DecorationSet {

        const allWidgets = [];

        // Add lineStart to each of the decorations' positions
        // And return the resulting widgets

        for (const lineNumberStr of Object.keys(decorationsByLine)) {
            const lineNumber = parseInt(lineNumberStr);
            const widgets = decorationsByLine[lineNumber];
            const lineStart = view.state.doc.line(lineNumber).from;


            const offsetWidgets = widgets.map((decoSpec => {
                return Decoration.mark({
                        inclusive: true,
                        attributes: {},
                        class: decoSpec.knownLevel
                }).range(decoSpec.start + lineStart, decoSpec.end + lineStart);
            }));

            allWidgets.push(...offsetWidgets);
        }

        return Decoration.set(allWidgets, true);
      }


      getWordsFromLine(text: string): WordPositions[] {
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



            
      
    },

    {
      decorations: (v) => v.decorations,
      // the code here makes it so that when you backspace over decorations, the whole word is backspaced. We don't want that.
      // provide: (plugin) =>
      //   EditorView.atomicRanges.of((view) => {
      //     const value = view.plugin(plugin);
      //     return value ? value.decorations : Decoration.none;
      //   }),
    },
  );
};

