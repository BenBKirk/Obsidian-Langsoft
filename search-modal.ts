import { App, SuggestModal } from "obsidian";
import type LangsoftPlugin from "main";
import type { Definition } from "dictionaries";
import { DefinitionIndex, SearchResult, TermIndex, WordResult } from "search";
import { splitContext } from "words";

/** What is searched: definitions ("dog" finds "hund"), or words in the language being learnt. */
export type SearchMode = "meaning" | "word";

type Item = { mode: "meaning"; result: SearchResult } | { mode: "word"; result: WordResult };

const PLACEHOLDERS: Record<SearchMode, string> = {
	meaning: "Search by meaning, e.g. dog",
	word: "Search words, or paste a sentence",
};

/**
 * "Langsoft: Search definitions" and "Langsoft: Search words". Tab switches
 * between the two, keeping what was typed.
 */
export class SearchModal extends SuggestModal<Item> {
	plugin: LangsoftPlugin;
	mode: SearchMode;
	// built once per search window, so they always match the dictionaries as they are now
	private definitions: DefinitionIndex;
	private words: TermIndex;

	constructor(app: App, plugin: LangsoftPlugin, mode: SearchMode = "meaning") {
		super(app);
		this.plugin = plugin;
		const { userDict, otherDicts } = plugin.dictManager;
		this.definitions = new DefinitionIndex(userDict, otherDicts);
		this.words = new TermIndex(userDict, otherDicts);
		this.limit = 50;
		this.setMode(mode);
		this.setInstructions([
			{ command: "Tab", purpose: "switch between searching by meaning and searching words" },
			{ command: "↵", purpose: "open in the Definer" },
		]);
		this.scope.register([], "Tab", (event) => {
			event.preventDefault();
			this.setMode(this.mode === "meaning" ? "word" : "meaning");
			// search again with what was typed
			this.inputEl.dispatchEvent(new Event("input"));
			return false;
		});
	}

	private setMode(mode: SearchMode) {
		this.mode = mode;
		this.setPlaceholder(PLACEHOLDERS[mode]);
		const empty = mode === "meaning" ? this.definitions.size === 0 : this.words.size === 0;
		this.emptyStateText = empty ? "No definitions yet." : mode === "meaning" ? "No matching definitions." : "No matching words.";
	}

	getSuggestions(query: string): Item[] {
		return this.mode === "meaning"
			? this.definitions.search(query, this.limit).map((result) => ({ mode: "meaning", result }))
			: this.words.search(query, this.limit).map((result) => ({ mode: "word", result }));
	}

	renderSuggestion(item: Item, el: HTMLElement) {
		el.addClass("langsoft-search-result");
		const title = el.createDiv({ cls: "langsoft-search-title" });
		// the same class as in the editor, so it gets the same colour
		title.createSpan({ cls: `langsoft-search-term ${item.result.highlight}`, text: item.result.term });

		if (item.mode === "meaning") {
			const { result } = item;
			title.createSpan({ cls: "langsoft-search-definition", text: result.definition });
			this.renderCoworkers(title, result.coworkers);
			this.renderGoButton(title, result.details);
			this.renderSentence(el, result.details?.sentence);
		} else {
			const { result } = item;
			if (result.inQuery) title.createSpan({ cls: "langsoft-search-coworkers", text: "in the sentence" });
			this.renderCoworkers(title, result.coworkers);
			this.renderGoButton(title, result.definitions.find((d) => d.details?.file)?.details);
			el.createDiv({
				cls: "langsoft-search-definitions",
				text: result.definitions.map((d) => d.definition).join(" / "),
			});
		}
	}

	private renderCoworkers(el: HTMLElement, coworkers: string[]) {
		if (coworkers.length > 0) el.createSpan({ cls: "langsoft-search-coworkers", text: coworkers.join(", ") });
	}

	private renderSentence(el: HTMLElement, sentence: string | undefined) {
		const text = String(sentence ?? "");
		if (text.trim() === "") return;
		const context = el.createDiv({ cls: "langsoft-search-context" });
		const parts = splitContext(text);
		if (parts) {
			context.appendText(parts.before);
			context.createEl("u", { text: parts.selection });
			context.appendText(parts.after);
		} else {
			context.setText(text);
		}
	}

	private renderGoButton(el: HTMLElement, details: Definition | undefined) {
		if (!details?.file) return;
		const go = el.createEl("button", { cls: "langsoft-search-go", text: "Go to sentence" });
		go.setAttribute("aria-label", `Open "${details.file}" where this was added`);
		// handled here, not as choosing the result (which opens the word in the Definer)
		go.addEventListener("mousedown", (event) => event.stopPropagation());
		go.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.close();
			void this.plugin.goToDefinitionContext(details);
		});
	}

	onChooseSuggestion(item: Item) {
		void this.plugin.openDefiner().then((definer) => definer?.handleSelection(item.result.term, ""));
	}
}
