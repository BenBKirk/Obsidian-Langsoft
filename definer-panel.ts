import type LangsoftPlugin from "main";
import { App, MarkdownView, moment, Platform } from "obsidian";
import type { Definition, WordEntry } from "dictionaries";
import { SearchModal } from "search-modal";
import { splitContext } from "words";

type Level = "unknown" | "semiknown" | "known";
export const LEVELS: Level[] = ["unknown", "semiknown", "known"];
const LEVEL_NAMES: Record<Level, string> = { unknown: "Unknown", semiknown: "Semi-known", known: "Known" };
const SHORT_NAMES: Record<Level, string> = { unknown: "Unknown", semiknown: "Semi", known: "Known" };

/** How long "Deleted … Undo" stays, in milliseconds. */
const UNDO_TIME = 10000;

/**
 * The Definer: the selected word, its level, your definitions and your
 * coworkers'. Drawn into any container, so it can live in the sidebar or
 * in a panel at the bottom of the editor. It is redrawn from the
 * dictionary after every change.
 */
export class DefinerPanel {
	plugin: LangsoftPlugin;
	app: App;
	private container: HTMLElement;
	/** In compact mode (the phone panel), less is shown. */
	private compact: boolean;

	/** The word or phrase shown, as in the dictionary (lower case); empty for none. */
	term = "";
	/** The sentence the word was selected in; empty if it didn't come from a note (e.g. from search). */
	selectionContext = "";
	/** The note the word was selected in, recorded when it was selected; undefined if not from a note. */
	selectionFile: string | undefined;
	/** The level shown: the word's own, or the one a first definition will get. */
	private level: Level = "unknown";
	/** The definition being edited, if any. */
	private editing: string | null = null;
	/** The definition just deleted, for "Undo". */
	private deleted: { definition: string; level: string } | null = null;
	private deletedTimer: number | undefined;
	private addInput: HTMLInputElement | null = null;

	constructor(container: HTMLElement, plugin: LangsoftPlugin, options: { compact?: boolean } = {}) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.container = container;
		this.compact = options.compact ?? false;
		container.addClass("langsoft-definer");
		container.toggleClass("is-compact", this.compact);
		// 1, 2, 3 set the level, while the Definer has focus but not when typing
		container.addEventListener("keydown", (event) => {
			const target = event.target as HTMLElement;
			if (target.closest("input, textarea") || event.ctrlKey || event.metaKey || event.altKey) return;
			const level = LEVELS[Number(event.key) - 1];
			if (level && this.term) {
				event.preventDefault();
				this.setLevel(level);
			}
		});
		this.render();
	}

	/** Show a word or phrase, and where it was selected (`context` is empty if not from a note). */
	handleSelection(selection: string, context: string) {
		const term = selection.trim().toLowerCase();
		const same = term === this.term && context === this.selectionContext;
		// the same word again while working in the Definer (e.g. after clicking in it): keep what is being typed
		if (same && this.container.contains(document.activeElement)) return;
		this.term = term;
		this.selectionContext = context;
		// the note it was selected in, now, before another note can become the active one
		if (!same) this.selectionFile = context ? this.app.workspace.getActiveFile()?.name : undefined;
		if (!same) {
			this.editing = null;
			this.deleted = null;
		}
		const highlight = this.ownEntry()?.highlight;
		this.level = isLevel(highlight) ? highlight : "unknown";
		this.render();
	}

	/** Put the cursor in the field for adding a definition. */
	getFocus() {
		this.addInput?.focus();
	}

	/** Set the shown word's level: straight away if it has definitions, otherwise for the first one added. */
	setLevel(level: Level) {
		if (!this.term || level === this.level) return;
		if (this.liveDefinitions().length > 0) {
			this.plugin.dictManager.writeHighlightChangeToJson(this.term, level);
		}
		this.level = level;
		this.render();
	}

	/**
	 * Where a definition added now comes from: the note and sentence the
	 * word was selected in. A word that didn't come from a note (e.g. one
	 * opened from search) has neither, rather than whatever note is open.
	 */
	getCurrentContext(): Definition {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const fromNote = Boolean(this.selectionContext);
		return {
			deleted: false,
			timestamp: timestamp,
			file: fromNote ? this.selectionFile : undefined,
			sentence: fromNote ? this.selectionContext : "",
		};
	}

	// --- reading the dictionary -------------------------------------------------

	private ownEntry(): WordEntry | undefined {
		return this.term ? this.plugin.dictManager.userDict[this.term] : undefined;
	}

	private liveDefinitions(): [string, Definition][] {
		return Object.entries(this.ownEntry()?.definitions ?? {}).filter(([, d]) => d && !d.deleted);
	}

	/** Coworkers' definitions, identical ones combined; `yours` marks ones you have too. */
	private coworkerDefinitions(): { definition: string; details: Definition; names: string[]; yours: boolean }[] {
		const mine = new Set(this.liveDefinitions().map(([definition]) => definition));
		const combined = new Map<string, { definition: string; details: Definition; names: string[]; yours: boolean }>();
		for (const name of Object.keys(this.plugin.dictManager.otherDicts).sort((a, b) => a.localeCompare(b))) {
			const entry = this.plugin.dictManager.otherDicts[name]?.[this.term];
			if (!entry || entry.highlight === "None") continue;
			for (const [definition, details] of Object.entries(entry.definitions ?? {})) {
				if (!details || details.deleted) continue;
				const existing = combined.get(definition);
				if (existing) existing.names.push(name);
				else combined.set(definition, { definition, details, names: [name], yours: mine.has(definition) });
			}
		}
		return [...combined.values()];
	}

	// --- changing the dictionary ------------------------------------------------

	private add(text: string, context = this.getCurrentContext()) {
		const definition = text.trim().toLowerCase();
		if (!this.term || definition === "") return;
		const manager = this.plugin.dictManager;
		manager.addNewDefinition(this.term, this.level, definition, context);
		manager.writeUserDictToJson();
		this.plugin.refreshHighlights();
		this.deleted = null;
		this.render();
	}

	private copy(definition: string, coworkerDetails: Definition) {
		let context = this.getCurrentContext();
		// not selected in a note: keep where the coworker saw it, rather than nothing
		if (!this.selectionContext) {
			context = { ...context, file: coworkerDetails.file, sentence: coworkerDetails.sentence ?? "" };
		}
		this.add(definition, context);
	}

	private remove(definition: string) {
		const level = this.ownEntry()?.highlight ?? this.level;
		this.plugin.dictManager.markDefinitionDeleted(this.term, definition);
		this.deleted = { definition, level };
		window.clearTimeout(this.deletedTimer);
		this.deletedTimer = window.setTimeout(() => {
			this.deleted = null;
			this.render();
		}, UNDO_TIME);
		this.render();
	}

	private undoRemove() {
		if (!this.deleted) return;
		this.plugin.dictManager.restoreDefinition(this.term, this.deleted.definition, this.deleted.level);
		this.deleted = null;
		window.clearTimeout(this.deletedTimer);
		this.render();
	}

	private rename(from: string, to: string) {
		this.plugin.dictManager.renameDefinition(this.term, from, to);
		this.editing = null;
		this.render();
	}

	/** After adding a definition on desktop, go back to the note to keep reading. */
	private returnToNote() {
		// on phones and tablets, focusing the note would open the on-screen keyboard over it
		if (Platform.isMobile) return;
		let view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			const leaf = leaves[this.plugin.lastTabIndex] ?? leaves[0];
			if (leaf) {
				this.app.workspace.setActiveLeaf(leaf);
				view = leaf.view as MarkdownView;
			}
		}
		view?.editor.focus();
	}

	// --- drawing ------------------------------------------------------------------

	private render() {
		const el = this.container;
		el.empty();
		this.addInput = null;
		if (!this.term) {
			this.renderEmpty(el);
			return;
		}
		this.renderHeader(el);
		this.renderLevels(el);
		this.renderOwn(el);
		this.renderCoworkers(el);
		this.renderPhrases(el);
	}

	private renderEmpty(el: HTMLElement) {
		const empty = el.createDiv({ cls: "langsoft-definer-empty" });
		empty.createDiv({ cls: "langsoft-definer-empty-title", text: "No word selected" });
		empty.createDiv({
			text: Platform.isMobile
				? "Long-press a word in a note to select it."
				: "Select a word in a note, or Ctrl+click it.",
		});
		const buttons = empty.createDiv({ cls: "langsoft-definer-empty-buttons" });
		this.searchButton(buttons, "word", "Search words", "⌕ Search words");
		this.searchButton(buttons, "meaning", "Search by meaning", "⌕ Search by meaning");
	}

	private searchButton(el: HTMLElement, mode: "word" | "meaning", label: string, text: string) {
		const button = el.createEl("button", { cls: "langsoft-definer-search", text });
		button.setAttribute("aria-label", label);
		button.addEventListener("click", () => new SearchModal(this.app, this.plugin, mode).open());
	}

	private renderHeader(el: HTMLElement) {
		const row = el.createDiv({ cls: "langsoft-definer-word-row" });
		// the same classes as the highlighting, so it gets the same colour
		const hasDefinitions = this.liveDefinitions().length > 0;
		row.createSpan({ cls: `langsoft-definer-word ${hasDefinitions ? this.level : ""}`, text: this.term });
		row.createSpan({ cls: "langsoft-definer-spacer" });
		if (this.compact) {
			this.searchButton(row, "word", "Search words", "⌕");
		} else {
			this.searchButton(row, "word", "Search words", "⌕ word");
			this.searchButton(row, "meaning", "Search by meaning", "⌕ meaning");
		}

		if (!this.compact && this.selectionContext) {
			const sentence = el.createDiv({ cls: "langsoft-definer-sentence" });
			this.renderContext(sentence, this.selectionContext);
			if (this.selectionFile) {
				sentence.createSpan({ cls: "langsoft-definer-faint", text: ` · ${noteName(this.selectionFile)}` });
			}
		}
	}

	private renderLevels(el: HTMLElement) {
		const levels = el.createDiv({ cls: "langsoft-definer-levels" });
		for (const [i, level] of LEVELS.entries()) {
			const button = levels.createEl("button", { cls: "langsoft-definer-level" });
			const colour = this.colour(level);
			button.createSpan({ cls: "langsoft-definer-dot" }).style.backgroundColor = colour;
			button.appendText(this.compact ? SHORT_NAMES[level] : LEVEL_NAMES[level]);
			if (!Platform.isMobile) button.createSpan({ cls: "langsoft-definer-key", text: String(i + 1) });
			const active = level === this.level;
			button.toggleClass("is-active", active);
			if (active) button.style.backgroundColor = colour;
			button.setAttribute("aria-pressed", String(active));
			button.addEventListener("click", () => this.setLevel(level));
		}
		if (!this.compact) {
			el.createDiv({
				cls: "langsoft-definer-hint",
				text:
					this.liveDefinitions().length > 0
						? `Changes straight away.${Platform.isMobile ? "" : " Keys 1 · 2 · 3."}`
						: "The level for the first definition you add.",
			});
		}
	}

	private renderOwn(el: HTMLElement) {
		const definitions = this.liveDefinitions();
		const heading = el.createDiv({ cls: "langsoft-definer-section" });
		heading.createSpan({ text: "Your definitions" });
		if (definitions.length > 0) heading.createSpan({ text: String(definitions.length) });

		const add = el.createDiv({ cls: "langsoft-definer-add" });
		const input = add.createEl("input", {
			type: "text",
			placeholder: definitions.length > 0 ? "Add a definition…" : "No definitions yet. Add the first…",
		});
		input.setAttribute("aria-label", "New definition");
		this.addInput = input;
		const submit = () => {
			const text = input.value;
			if (text.trim() === "") return;
			this.add(text);
			this.returnToNote();
		};
		input.addEventListener("keydown", (event) => {
			// not while an input method or predictive keyboard is still composing text
			if (event.key === "Enter" && !event.isComposing) {
				event.preventDefault();
				submit();
			}
		});
		const plus = add.createEl("button", { cls: "mod-cta", text: "+" });
		plus.setAttribute("aria-label", "Add definition");
		plus.addEventListener("click", submit);

		const list = el.createDiv({ cls: "langsoft-definer-list" });
		for (const [definition, details] of definitions) {
			const item = list.createDiv({ cls: "langsoft-definer-def" });
			const line = item.createDiv({ cls: "langsoft-definer-def-line" });
			if (this.editing === definition) {
				this.renderEditor(line, definition);
			} else {
				line.createSpan({ cls: "langsoft-definer-def-text", text: definition });
				this.tool(line, "✎", "Edit", () => {
					this.editing = definition;
					this.render();
				});
				this.tool(line, "🗑", "Delete", () => this.remove(definition));
			}
			if (!this.compact) this.renderDetails(item, details);
		}

		if (this.deleted) {
			const toast = el.createDiv({ cls: "langsoft-definer-toast" });
			toast.createSpan({ text: `Deleted “${this.deleted.definition}”.` });
			const undo = toast.createEl("a", { text: "Undo", href: "#" });
			undo.addEventListener("click", (event) => {
				event.preventDefault();
				this.undoRemove();
			});
		}
	}

	private renderEditor(line: HTMLElement, definition: string) {
		const input = line.createEl("input", { type: "text", cls: "langsoft-definer-edit", value: definition });
		input.setAttribute("aria-label", "Edit definition");
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.isComposing) {
				event.preventDefault();
				this.rename(definition, input.value);
			} else if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				this.editing = null;
				this.render();
			}
		});
		this.tool(line, "✓", "Save", () => this.rename(definition, input.value));
		this.tool(line, "✕", "Cancel", () => {
			this.editing = null;
			this.render();
		});
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	/** The sentence, note and date a definition was added with, and "Go to sentence". */
	private renderDetails(el: HTMLElement, details: Definition) {
		const meta = el.createDiv({ cls: "langsoft-definer-meta" });
		const parts: (() => void)[] = [];
		const sentence = String(details.sentence ?? "");
		if (sentence.trim()) parts.push(() => this.renderContext(meta, sentence));
		if (details.file) parts.push(() => meta.appendText(noteName(details.file!)));
		const date = moment(details.timestamp, "YYYY-MM-DD HH:mm:ss");
		if (date.isValid()) parts.push(() => meta.appendText(date.format("D MMM YYYY")));
		parts.forEach((part, i) => {
			if (i > 0) meta.appendText(" · ");
			part();
		});
		if (details.file) {
			meta.appendText(" · ");
			const go = meta.createEl("a", { text: "Go to sentence", href: "#" });
			go.addEventListener("click", (event) => {
				event.preventDefault();
				this.plugin.goToDefinitionContext({ file: details.file, sentence });
			});
		}
	}

	private renderCoworkers(el: HTMLElement) {
		const coworkers = this.coworkerDefinitions();
		if (coworkers.length === 0) return;
		el.createDiv({ cls: "langsoft-definer-section" }).createSpan({ text: "Coworkers" });

		for (const item of coworkers.filter((c) => !c.yours)) {
			const block = el.createDiv({ cls: "langsoft-definer-coworker" });
			block.style.borderLeftColor = this.plugin.settings.coworkerColor;
			const row = block.createDiv({ cls: "langsoft-definer-def-line" });
			row.createSpan({ cls: "langsoft-definer-def-text", text: item.definition });
			row.createSpan({ cls: "langsoft-definer-faint", text: item.names.join(", ") });
			const add = row.createEl("button", { cls: "langsoft-definer-copy", text: this.compact ? "+" : "+ Add" });
			add.setAttribute("aria-label", "Add to your definitions");
			add.addEventListener("click", () => this.copy(item.definition, item.details));
			if (!this.compact) this.renderDetails(block, item.details);
		}
		for (const item of coworkers.filter((c) => c.yours)) {
			el.createDiv({
				cls: "langsoft-definer-also",
				text: `${item.names.join(", ")} also ${item.names.length === 1 ? "has" : "have"}: ${item.definition}`,
			});
		}
	}

	/** Phrases you've defined that start with this word; tap one to open it. */
	private renderPhrases(el: HTMLElement) {
		const dict = this.plugin.dictManager.userDict;
		const phrases = (this.ownEntry()?.firstwordofphrase ?? []).filter((phrase) =>
			Object.values(dict[phrase]?.definitions ?? {}).some((d) => d && !d.deleted)
		);
		if (phrases.length === 0) return;
		el.createDiv({ cls: "langsoft-definer-section" }).createSpan({ text: `Phrases with “${this.term}”` });
		const chips = el.createDiv({ cls: "langsoft-definer-chips" });
		for (const phrase of phrases) {
			const chip = chips.createEl("button", { cls: "langsoft-definer-chip", text: phrase });
			chip.addEventListener("click", () => this.handleSelection(phrase, ""));
		}
	}

	/** A saved context as “before <u>word</u> after”, as text (it can come from coworkers' files). */
	private renderContext(el: HTMLElement, context: string) {
		const parts = splitContext(context);
		if (!parts) {
			el.appendText(context);
			return;
		}
		const before = parts.before.trim();
		const after = parts.after.trim();
		el.appendText(`“${before ? `${before} ` : ""}`);
		el.createEl("u", { text: parts.selection.trim() });
		el.appendText(`${after ? ` ${after}` : ""}”`);
	}

	private tool(el: HTMLElement, icon: string, label: string, action: () => void) {
		const button = el.createEl("button", { cls: "langsoft-definer-tool clickable-icon", text: icon });
		button.setAttribute("aria-label", label);
		button.addEventListener("click", action);
	}

	private colour(level: Level): string {
		const { settings } = this.plugin;
		return level === "known" ? settings.knownColor : level === "semiknown" ? settings.semiknownColor : settings.unknownColor;
	}
}

function isLevel(level: unknown): level is Level {
	return level === "unknown" || level === "semiknown" || level === "known";
}

/** "2025-10-23 Notes.md" → "2025-10-23 Notes". */
function noteName(file: string): string {
	return file.replace(/\.md$/, "");
}
