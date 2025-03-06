import { syntaxTree } from "@codemirror/language";
import {
  Extension,
  RangeSetBuilder,
  StateField,
  Transaction,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
  ViewPlugin,
} from "@codemirror/view";
import { EmojiWidget } from "emoji";
import { debounce } from "obsidian";

export const emojiListField = StateField.define<DecorationSet>({
  create(state): DecorationSet {
    return Decoration.none;
  },
  update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
    // console.log(transaction.docChanged);
    // transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    //   console.log(transaction.state.doc.lineAt(toB).text);
    //   console.log(transaction.changes.iterChanges((fromA,toA,fromB,toB,text) => {
    //     console.log(text.toString());
    //   }))
    // } )

    const builder = new RangeSetBuilder<Decoration>();

    syntaxTree(transaction.state).iterate({
      enter(node) {
        // console.log(node)
        // node.type.name.toString
        if (node.type.name.startsWith("list")) {
          // Position of the '-' or the '*'.
          const listCharFrom = node.from - 2;

          builder.add(
            listCharFrom,
            listCharFrom + 1,
            Decoration.replace({
              widget: new EmojiWidget(),
            })
          );
            

        }
      },
    });

    return builder.finish();
  },
  provide(field: StateField<DecorationSet>): Extension {
    return EditorView.decorations.from(field);
  },
});

async function testApi(text) {
  await new Promise(resolve => setTimeout(resolve, 1000))
  return `you waited for ${text}`
}


let debouncedApi = debounce(testApi,1000,true);

let call_api = async (text) => {
  await new Promise(resolve => setTimeout(resolve, 5000))
  return `You selected "${text}"!!!`
}


export const apiRequestExtension = ViewPlugin.define((state) => {
  return {
    update(update) {
      
    }
  }
})
