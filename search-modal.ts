import { App, SuggestModal } from "obsidian";
import type LangsoftPlugin from "main";
import { DefinitionIndex, SearchResult } from "search";
import { splitContext } from "words";

/** "Langsoft: Search definitions": find words by their meaning. */
export class SearchModal extends SuggestModal<SearchResult> {
	plugin: LangsoftPlugin;
	index: DefinitionIndex;

	constructor(app: App, plugin: LangsoftPlugin) {
		super(app);
		this.plugin = plugin;
		// built once per search, so it always matches the dictionaries as they are now
		this.index = new DefinitionIndex(plugin.dictManager.userDict, plugin.dictManager.otherDicts);
		this.setPlaceholder("Search definitions, e.g. dog");
		this.emptyStateText = this.index.size === 0 ? "No definitions yet." : "No matching definitions.";
		this.limit = 50;
	}

	getSuggestions(query: string): SearchResult[] {
		return this.index.search(query, this.limit);
	}

	renderSuggestion(result: SearchResult, el: HTMLElement) {
		el.addClass("langsoft-search-result");
		const title = el.createDiv({ cls: "langsoft-search-title" });
		// the same class as in the editor, so it gets the same colour
		title.createSpan({ cls: `langsoft-search-term ${result.highlight}`, text: result.term });
		title.createSpan({ cls: "langsoft-search-definition", text: result.definition });
		if (result.coworkers.length > 0) {
			title.createSpan({ cls: "langsoft-search-coworkers", text: result.coworkers.join(", ") });
		}

		const sentence = String(result.details?.sentence ?? "");
		if (sentence.trim() !== "") {
			const context = el.createDiv({ cls: "langsoft-search-context" });
			const parts = splitContext(sentence);
			if (parts) {
				context.appendText(parts.before);
				context.createEl("u", { text: parts.selection });
				context.appendText(parts.after);
			} else {
				context.setText(sentence);
			}
		}
	}

	async onChooseSuggestion(result: SearchResult) {
		const definer = await this.plugin.activateView();
		definer?.handleSelection(result.term, "");
	}
}
