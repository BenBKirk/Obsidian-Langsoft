import { debounce, Editor, MarkdownView, normalizePath, Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { EditorView, hoverTooltip } from "@codemirror/view";
import { createSelectionHighlightPlugin, createHighlightPlugin, TriggerEffect, TriggerField } from "highlighter";
import { DEFAULT_SETTINGS, LangsoftPluginSettings, LangsoftSettingsTab } from "settings";
import { DictionaryManager } from "dictionaries";
import { VIEW_TYPE_DEFINER, DefinerView } from "definer";
import { buildSelectionContext, findWordAt, parseIntoWords as splitIntoWords, termKey } from "words";
import { DEFAULT_FOLDER, LEGACY_FOLDER } from "dictionary-files";
import { UserModal } from "user-modal";
import { SearchModal } from "search-modal";
import { ProgressView, VIEW_TYPE_PROGRESS } from "progress-view";
import { GridView, VIEW_TYPE_GRID } from "grid-view";
import { backupNow, openRestore } from "backup-modal";
import { backedUpToday, listBackups, makeBackup } from "backup";
import { createCoveragePanel } from "coverage-panel";
import { highlightElement } from "reading-view";
import { createDefinerBottomPanel } from "definer-bottom-panel";
import type { DefinerPanel } from "definer-panel";
import type { Definition } from "dictionaries";
import { ContextMatch, findContext } from "locate";
import { Example, findExamples } from "examples";


export default class LangsoftPlugin extends Plugin {
	myViewPlugin: ReturnType<typeof createHighlightPlugin>;
	mySelectionViewPlugin: ReturnType<typeof createSelectionHighlightPlugin>;
	settings: LangsoftPluginSettings;
	/** Whose dictionary is being edited on this device. Empty if not chosen yet. */
	currentUser = "";
	/**
	 * Identifies this device's file in each user's folder, e.g.
	 * "desktop-1a2b3c4d". Kept in local storage, per vault.
	 */
	deviceId = "";
	statusBarEl: HTMLElement;
	/** The Definer at the bottom of the editor, used on phones. */
	bottomPanel = createDefinerBottomPanel(this);
	settingsTab: LangsoftSettingsTab;
	dictManager: DictionaryManager;
	SelectedText: Array<number>;
	lastFile: TFile;
	lastTabIndex: number;


	async onload() {
		this.SelectedText = [];
		this.lastTabIndex = 0;
		await this.loadSettings()
		await this.loadCurrentUser();
		this.loadDeviceId();
		this.settingsTab = new LangsoftSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		this.myViewPlugin = createHighlightPlugin(this);
		this.mySelectionViewPlugin = createSelectionHighlightPlugin(this);
		this.registerEditorExtension(this.myViewPlugin);
		this.registerEditorExtension(this.mySelectionViewPlugin);
		this.registerEditorExtension(TriggerField);
		this.registerEditorExtension(this.bottomPanel.extension);
		this.registerEditorExtension(createCoveragePanel(this));
		this.registerReadingView();

		// On phones and tablets, show what is selected in the note: long-pressing
		// a word selects it. Waits until the selection has stopped changing.
		if (Platform.isMobile) {
			const showSelection = debounce(() => this.showEditorSelection(), 600, true);
			this.registerEditorExtension(
				EditorView.updateListener.of((update) => {
					if (update.selectionSet && !update.state.selection.main.empty) showSelection();
				})
			);
		}

		this.dictManager = new DictionaryManager(this);
		void this.dictManager.init();
		this.updateStyle();
		// popout windows get the highlight colours too
		this.registerEvent(this.app.workspace.on("window-open", (win) => win.doc.body.setCssProps(this.colourProps)));
		this.registerEditorExtension(this.wordHover);


		this.registerView(
			VIEW_TYPE_DEFINER,
			(leaf) => new DefinerView(leaf, this)
		);
		this.registerView(VIEW_TYPE_PROGRESS, (leaf) => new ProgressView(leaf, this));
		this.registerView(VIEW_TYPE_GRID, (leaf) => new GridView(leaf, this));

		this.addCommand({
			id: "define-selection",
			name: "Define selection",
			editorCallback: async () => {
				const definer = await this.showEditorSelection(true);
				if (!Platform.isMobile) definer?.getFocus();
			},
		});

		this.addCommand({
			id: "show-progress",
			name: "Show progress",
			callback: () => this.openProgress(),
		});

		this.addCommand({
			id: "backup-now",
			name: "Back up dictionary now",
			callback: () => backupNow(this),
		});

		this.addCommand({
			id: "restore-backup",
			name: "Restore from a backup",
			callback: () => openRestore(this),
		});

		this.addCommand({
			id: "open-dictionary",
			name: "Open dictionary",
			callback: () => this.openPage(VIEW_TYPE_GRID),
		});

		// the level of the word in the Definer; can be given hotkeys or put in the phone toolbar
		for (const [level, name] of [
			["unknown", "Mark as unknown"],
			["semiknown", "Mark as semi-known"],
			["known", "Mark as known"],
		] as const) {
			this.addCommand({
				id: `mark-${level}`,
				name,
				checkCallback: (checking) => {
					const definer = this.getDefiner();
					if (!definer?.term) return false;
					if (!checking) definer.setLevel(level);
					return true;
				},
			});
		}

		this.addCommand({
			id: "search-definitions",
			name: "Search definitions",
			callback: () => new SearchModal(this.app, this, "meaning").open(),
		});

		this.addCommand({
			id: "search-words",
			name: "Search words",
			callback: () => new SearchModal(this.app, this, "word").open(),
		});

		this.addCommand({
			id: "switch-user",
			name: "Switch user",
			callback: () => this.openUserPicker(),
		});

		// desktop only: Obsidian has no status bar on phones
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("mod-clickable");
		this.statusBarEl.setAttribute("aria-label", "Switch Langsoft user");
		this.registerDomEvent(this.statusBarEl, "click", () => this.openUserPicker());
		this.updateStatusBar();

		// first run on this device
		this.app.workspace.onLayoutReady(() => {
			void this.turnOffOldCopy();
			if (!this.currentUser) this.openUserPicker();
		});


		this.registerDomEvent(activeDocument.body, "mouseup", async (event) => {
			// desktop only: touch screens send mouse events for every tap; see showEditorSelection
			if (Platform.isMobile) return;
			this.SelectedText = [];
			// in Reading view the editor is hidden: use the page's own selection
			const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView?.getMode() === "preview") {
				// Ctrl+click on a highlighted word is handled as a click; see registerReadingView
				if (!event.ctrlKey && !event.metaKey) void this.showReadingSelection();
				return;
			}

			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor) return;

			try {
				const tab = this.app.workspace.getMostRecentLeaf();  // active tab
				// the pane that holds the tabs (`parent` exists at runtime but is missing from the typings)
				const parent = (tab as unknown as { parent: { children: (WorkspaceLeaf | null)[] } }).parent;
				const tabIndex = parent.children.indexOf(tab);           // 0-based index
				this.lastTabIndex = tabIndex
			} catch {
				this.lastTabIndex = 0
			}

			if (event.ctrlKey) {
				let selectedText = editor.getSelection().trim();
				if (selectedText == "") {
					const word = this.selectWordAtCursor(editor);
					if (word) {
						selectedText = word;
					} else {
						const leaf = await this.activateView();
						leaf?.handleSelection("", "");
						return;
					}
				}

				const fromCursor = editor.getCursor("from")
				const toCursor = editor.getCursor("to")
				const start = editor.posToOffset(fromCursor)
				const end = editor.posToOffset(toCursor)
				this.SelectedText = [start, end];
				this.refreshHighlights(false)
				// read the editor before awaiting, in case the selection changes meanwhile
				const context = this.getContextForSelection(editor);
				const leaf = await this.activateView();
				leaf?.handleSelection(selectedText.trim(), context);
				leaf?.getFocus();
			} else {
				this.refreshHighlights(false)
				const selection = editor.getSelection().trim();
				const context = this.getContextForSelection(editor);
				const leaf = await this.activateView();
				leaf?.handleSelection(selection, context);
			}


		}
		);

		// keep definitions pointing at their note when it is renamed in Obsidian
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const oldName = oldPath.slice(oldPath.lastIndexOf("/") + 1);
				if (oldName === file.name) return; // only moved to another folder
				// only the name is saved, so if another note still has the old name,
				// the definitions may be from that one: leave them
				if (this.app.vault.getMarkdownFiles().some((note) => note.name === oldName)) return;
				this.dictManager.renameNote(oldName, file.name);
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const file = this.app.workspace.getActiveFile()
				if (!file) return;

				if (!this.lastFile || file.path !== this.lastFile.path) {
					this.lastFile = file;
					this.SelectedText = [];
					this.getDefiner()?.handleSelection("", "");
				}


				void this.dictManager.reloadOtherDictsIfChanged();

			})
		);


		//
		//
		// 	// }

	}


	selectWordAtCursor(editor: Editor) {
		const cursor = editor.getCursor();
		const lineText = editor.getLine(cursor.line);
		const word = findWordAt(lineText, cursor.ch);
		if (!word) return null;

		// Select that word
		editor.setSelection(
			{ line: cursor.line, ch: word.from },
			{ line: cursor.line, ch: word.to }
		);
		return word.text;
	}

	//
	//
	//
	//

	/** Redraw notes open in Reading view, after the dictionary changed, at most every half second. */
	private refreshReadingViews = debounce(() => {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.getMode() === "preview") {
				leaf.view.previewMode.rerender(true);
			}
		}
	}, 500, true);

	/**
	 * Highlight words in Reading view, and open them in the Definer: by
	 * selecting text, by Ctrl+clicking a highlighted word, or on phones and
	 * tablets by tapping it or long-pressing to select.
	 */
	private registerReadingView() {
		this.registerMarkdownPostProcessor((el) => {
			if (!this.settings.highlightReadingView || !this.currentUser) return;
			highlightElement(el, this.dictManager.userDict, this.dictManager.otherDicts);
		});

		this.registerDomEvent(activeDocument, "click", async (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			const span = target?.closest<HTMLElement>(".markdown-reading-view .langsoft-rv[data-langsoft-term]");
			// not inside links, which keep working as links
			if (!span || span.closest("a")) return;
			if (!Platform.isMobile && !event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			const range = activeDocument.createRange();
			range.selectNodeContents(span);
			const context = this.readingContext(range, span.textContent ?? "");
			const definer = await this.openDefiner();
			definer?.handleSelection(span.textContent ?? "", context);
		});

		// on phones and tablets, long-pressing selects a word in Reading view too
		if (Platform.isMobile) {
			const show = debounce(() => this.showReadingSelection(), 600, true);
			this.registerDomEvent(activeDocument, "selectionchange", () => {
				if (this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() === "preview") show();
			});
		}
	}

	/** Show what is selected in a note in Reading view in the Definer. */
	private async showReadingSelection() {
		const selection = window.getSelection();
		const text = selection?.toString() ?? "";
		if (!selection || selection.rangeCount === 0 || text.trim() === "" || text.length > 200) return;
		const range = selection.getRangeAt(0);
		const start = range.startContainer.instanceOf(Element) ? range.startContainer : range.startContainer.parentElement;
		if (!start?.closest(".markdown-reading-view")) return;
		const context = this.readingContext(range, text);
		const definer = await this.openDefiner();
		definer?.handleSelection(text.trim(), context);
	}

	/** The text around a selection in Reading view, as saved with definitions. */
	private readingContext(range: Range, selected: string): string {
		const end = range.endContainer.instanceOf(Element) ? range.endContainer : range.endContainer.parentElement;
		const block = end?.closest("p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, dd, dt") ?? end;
		if (!block) return "";
		const before = activeDocument.createRange();
		before.setStart(block, 0);
		before.setEnd(range.endContainer, range.endOffset);
		const text = block.textContent ?? "";
		return buildSelectionContext(text.replace(/\n/g, " "), before.toString().length, selected);
	}

	/**
	 * Open a note with the text from `from` to `to` selected, and show it in
	 * the Definer, as if it had been selected by hand.
	 */
	async openNoteAt(file: TFile, from: number, to: number) {
		const leaf = this.app.workspace.getLeaf(false);
		// in editing mode, where the word can be selected
		await leaf.openFile(file, { active: true, state: { mode: "source" } });
		if (!(leaf.view instanceof MarkdownView)) return;
		const editor = leaf.view.editor;
		const start = editor.offsetToPos(from);
		const end = editor.offsetToPos(to);
		editor.setSelection(start, end);
		editor.scrollIntoView({ from: start, to: end }, true);

		const definer = await this.openDefiner();
		definer?.handleSelection(editor.getSelection().trim(), this.getContextForSelection(editor));
		if (!Platform.isMobile) {
			// the outline a Ctrl+click gives, and focus back in the note
			// (on phones and tablets, focusing would open the keyboard)
			this.SelectedText = [from, to];
			this.refreshHighlights(false);
			editor.focus();
		}
	}

	/**
	 * Every place a word or phrase appears in the vault's notes, at most
	 * `limit`: the given note first, then the most recently changed notes.
	 * `skip` leaves out one place (where the word was selected). Gives way to
	 * the interface every few notes, so large vaults don't freeze it.
	 */
	async findExamplesInVault(term: string, first?: string, skip?: { file: string; from: number }, limit = 200) {
		const files = this.app.vault
			.getMarkdownFiles()
			.sort((a, b) => Number(b.path === first) - Number(a.path === first) || b.stat.mtime - a.stat.mtime);
		const results: { file: TFile; example: Example }[] = [];
		for (const [i, file] of files.entries()) {
			if (i % 50 === 49) await new Promise((resolve) => window.setTimeout(resolve, 0));
			for (const example of findExamples(await this.app.vault.cachedRead(file), term)) {
				if (skip && skip.file === file.path && skip.from === example.from) continue;
				results.push({ file, example });
				if (results.length >= limit) return results;
			}
		}
		return results;
	}

	/** Open the progress page, or switch to it if it is already open. */
	/**
	 * Open the note a definition was added in, with the word selected, if
	 * its sentence can still be found there. Otherwise say why not.
	 */
	async goToDefinitionContext(details: Pick<Definition, "file" | "sentence">) {
		const name = details?.file;
		if (!name) {
			new Notice("Langsoft: no note was saved with this definition.");
			return;
		}
		// only the file name is saved, not its folder, so try every note with that name
		const allNotes = this.app.vault.getMarkdownFiles();
		const notes = allNotes.filter((file) => file.name === name);
		let best: { file: TFile; match: ContextMatch } | null = null;
		for (const file of notes) {
			const match = findContext(await this.app.vault.cachedRead(file), details.sentence);
			if (match && (!best || (match.exact && !best.match.exact))) best = { file, match };
		}
		// the note may have been renamed or moved: look for the exact sentence in every other note
		let elsewhere = 0;
		if (!best) {
			for (const file of allNotes) {
				if (file.name === name) continue;
				const match = findContext(await this.app.vault.cachedRead(file), details.sentence);
				if (!match?.exact) continue;
				if (!best) best = { file, match };
				elsewhere++;
			}
		}
		if (!best) {
			new Notice(notes.length === 0
				? `Langsoft: there is no note called "${name}" in this vault, and the sentence this was added from isn't in any other note.`
				: `Langsoft: the sentence this was added from isn't in "${name}" any more, or in any other note.`);
			return;
		}

		await this.openNoteAt(best.file, best.match.from, best.match.to);
		if (elsewhere > 0) {
			const others = elsewhere > 1 ? ` (it is also in ${elsewhere - 1} other note${elsewhere > 2 ? "s" : ""})` : "";
			new Notice(`Langsoft: this was added in "${name}", but its sentence is now in "${best.file.name}"${others}. The note may have been renamed or moved.`, 8000);
		} else if (!best.match.exact) {
			new Notice("Langsoft: the sentence has changed since this was added; this is the closest match.");
		}
	}

	async openProgress() {
		await this.openPage(VIEW_TYPE_PROGRESS);
	}

	/** Langsoft's ID before version 1.12, when it moved to "langsoft" for the community plugin list. */
	private static readonly OLD_ID = "langsoft-plugin";

	/** The settings of a copy of Langsoft installed under its old ID, if there is one. */
	private async importOldSettings(): Promise<Record<string, unknown> | null> {
		const adapter = this.app.vault.adapter;
		const pluginsFolder = normalizePath(`${this.app.vault.configDir}/plugins`);
		try {
			for (const folder of (await adapter.list(pluginsFolder)).folders) {
				if (folder === this.manifest.dir) continue;
				const manifestPath = normalizePath(`${folder}/manifest.json`);
				const dataPath = normalizePath(`${folder}/data.json`);
				if (!(await adapter.exists(manifestPath)) || !(await adapter.exists(dataPath))) continue;
				const manifest = JSON.parse(await adapter.read(manifestPath)) as { id?: unknown } | null;
				if (manifest?.id !== LangsoftPlugin.OLD_ID) continue;
				const data = JSON.parse(await adapter.read(dataPath)) as unknown;
				if (data && typeof data === "object" && !Array.isArray(data)) {
					new Notice(`Langsoft: brought over your settings from the old copy of Langsoft in “${folder}”.`);
					return data as Record<string, unknown>;
				}
			}
		} catch (e) {
			console.warn("Langsoft: could not look for settings from an older copy", e);
		}
		return null;
	}

	/**
	 * Two copies of Langsoft running at once would both save your dictionary.
	 * If the copy under the old ID is still switched on, switch it off; its
	 * folder is left for you to delete.
	 */
	private async turnOffOldCopy() {
		// Obsidian's list of plugins isn't in its public API, so check carefully
		const plugins = (this.app as unknown as { plugins?: { enabledPlugins?: Set<string>; disablePluginAndSave?: (id: string) => Promise<void>; manifests?: Record<string, { dir?: string }> } }).plugins;
		if (!plugins?.enabledPlugins?.has(LangsoftPlugin.OLD_ID) || typeof plugins.disablePluginAndSave !== "function") return;
		const folder = plugins.manifests?.[LangsoftPlugin.OLD_ID]?.dir ?? `${this.app.vault.configDir}/plugins/${LangsoftPlugin.OLD_ID}`;
		await plugins.disablePluginAndSave(LangsoftPlugin.OLD_ID);
		new Notice(
			`Langsoft: switched off the old copy of Langsoft, so only this one runs. Your dictionaries and settings are kept. You can delete its folder: “${folder}”.`,
			0
		);
	}

	/** The day a backup was last made or found on this device, so the folder isn't listed on every save. */
	private lastBackupDay = "";

	/** After your dictionary was saved: the daily backup, if due. Waits a few seconds so a burst of saves makes one check. */
	dictionarySaved = debounce(() => this.dailyBackup(), 5000, true);

	private async dailyBackup() {
		const user = this.currentUser;
		const today = new Date().toDateString();
		if (!this.settings.autoBackup || !user || this.lastBackupDay === `${user} ${today}`) return;
		try {
			const adapter = this.app.vault.adapter;
			if (!backedUpToday(await listBackups(adapter, user))) {
				await makeBackup(adapter, user, this.dictManager.userDict);
			}
			this.lastBackupDay = `${user} ${today}`;
		} catch (e) {
			console.error("Langsoft: daily backup failed", e);
		}
	}

	/** Open a page (progress, dictionary) in a tab, or switch to it if it is already open. */
	async openPage(type: string) {
		const existing = this.app.workspace.getLeavesOfType(type)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.setViewState({ type, active: true });
		void this.app.workspace.revealLeaf(leaf);
	}

	/** Redraw open progress and dictionary pages, at most once a second, after the dictionary changed. */
	private refreshProgress = debounce(() => {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROGRESS)) {
			if (leaf.view instanceof ProgressView) leaf.view.render();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRID)) {
			if (leaf.view instanceof GridView) leaf.view.refresh();
		}
	}, 1000, true);

	/**
	 * Redraw highlights. `dictionaryChanged` is false when only the selection
	 * outline changed, so Reading view and the progress page aren't redrawn.
	 */
	refreshHighlights(dictionaryChanged = true) {
		if (dictionaryChanged) {
			this.refreshProgress();
			this.refreshReadingViews();
		}
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view instanceof MarkdownView ? leaf.view : null;
			if (mdView) {
				const cm = (mdView.editor as unknown as { cm?: EditorView }).cm;
				cm?.dispatch({ effects: TriggerEffect.of(null) });
			}
		}
	}


	/** Whether the Definer is shown at the bottom of the editor rather than in the sidebar. */
	usesBottomPanel(): boolean {
		return Platform.isPhone;
	}

	/** The CodeMirror view of the note being edited, if any. */
	private activeEditorView(): EditorView | null {
		const editor = this.app.workspace.activeEditor?.editor as unknown as { cm?: EditorView } | undefined;
		return editor?.cm ?? null;
	}

	/** The Definer if it is open: the bottom panel on phones, the sidebar elsewhere. */
	getDefiner(): DefinerPanel | null {
		if (this.usesBottomPanel()) {
			const view = this.activeEditorView();
			return view ? this.bottomPanel.get(view) : null;
		}
		return this.getDefinerViewLeaf()?.panel ?? null;
	}

	/** Open the Definer if needed, and return it once it is ready. */
	async openDefiner(): Promise<DefinerPanel | null> {
		const view = this.usesBottomPanel() ? this.activeEditorView() : null;
		// on a phone with no note open, the sidebar is the only place to show it
		if (view) return this.bottomPanel.openIn(view);
		return (await this.activateView())?.panel ?? null;
	}

	/**
	 * Show the text selected in the note in the Definer. With `selectWord`,
	 * select the word at the cursor if nothing is selected.
	 */
	async showEditorSelection(selectWord = false): Promise<DefinerPanel | null> {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) return null;
		let selection = editor.getSelection().trim();
		if (selection === "" && selectWord) selection = this.selectWordAtCursor(editor) ?? "";
		// nothing to show, or a whole paragraph rather than a word or phrase
		if (selection === "" || selection.length > 200) return null;
		const context = this.getContextForSelection(editor);
		const definer = await this.openDefiner();
		definer?.handleSelection(selection, context);
		return definer;
	}

	/** The open Definer sidebar, or null if it isn't open. */
	getDefinerViewLeaf(): DefinerView | null {
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER)[0]?.view;
		return view instanceof DefinerView ? view : null;

	}

	/** The highlight colours as CSS variables on the page; styles.css uses them. */
	private static readonly COLOUR_VARIABLES = ["unknown", "semiknown", "known", "coworker"]
		.map((level) => [`--langsoft-${level}-background`, `--langsoft-${level}-underline`])
		.reduce((all, names) => all.concat(names), []);

	hexToRGB(hex: string, alpha: number) {
		const r = parseInt(hex.slice(1, 3), 16),
			g = parseInt(hex.slice(3, 5), 16),
			b = parseInt(hex.slice(5, 7), 16);

		if (alpha) {
			return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
		} else {
			return "rgb(" + r + ", " + g + ", " + b + ")";
		}
	}

	updateStyle() {
		const settings = this.settings;
		const levels: [string, boolean, string][] = [
			["unknown", settings.unknownEnabled, settings.unknownColor],
			["semiknown", settings.semiknownEnabled, settings.semiknownColor],
			["known", settings.knownEnabled, settings.knownColor],
			["coworker", settings.coworkerEnabled, settings.coworkerColor],
		];
		const props: Record<string, string> = {};
		for (const [level, enabled, colour] of levels) {
			props[`--langsoft-${level}-background`] = enabled ? this.hexToRGB(colour, 0.2) : "transparent";
			props[`--langsoft-${level}-underline`] = enabled ? this.hexToRGB(colour, 0.5) : "transparent";
		}
		this.colourProps = props;
		// every window: the main one, popouts, and wherever the settings are open
		for (const doc of this.openDocuments()) doc.body.setCssProps(props);
	}

	/** The colour variables last set, for windows opened later. */
	private colourProps: Record<string, string> = {};

	/** The pages of all of Obsidian's open windows. */
	private openDocuments(): Set<Document> {
		const docs = new Set<Document>([this.app.workspace.containerEl.doc, activeDocument]);
		this.app.workspace.iterateAllLeaves((leaf) => docs.add(leaf.view.containerEl.doc));
		return docs;
	}


	async loadSettings() {
		let data = (await this.loadData()) as Partial<LangsoftPluginSettings> | null;
		// first run under the "langsoft" ID: bring over the settings of a copy installed under the old ID
		if (data === null) {
			data = await this.importOldSettings();
			if (data) await this.saveData(data);
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// versions before 1.2 used a hidden folder by default; their data.json still names it
		if (this.settings.dictionaryFolder === LEGACY_FOLDER) {
			this.settings.dictionaryFolder = DEFAULT_FOLDER;
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.dictManager.init();
	}

	/**
	 * The current user is kept in this device's local storage, not in the
	 * plugin's data.json: if the vault is synced between people, data.json is
	 * shared, and everyone would end up editing the same dictionary.
	 */
	/**
	 * A value kept on this device for this vault, not synced: the current
	 * user and the device ID. Kept with Obsidian's local storage for the
	 * vault; before version 1.12.1 it was under a key with the vault's name,
	 * which is carried over once.
	 */
	private readLocal(name: "current-user" | "device-id"): string | null {
		const value: unknown = this.app.loadLocalStorage(`langsoft-${name}`);
		if (typeof value === "string" && value) return value;
		let old: string | null = null;
		const oldKey = `langsoft:${this.app.vault.getName()}:${name}`;
		try {
			old = window.localStorage.getItem(oldKey);
			if (old) {
				this.writeLocal(name, old);
				window.localStorage.removeItem(oldKey);
			}
		} catch (e) {
			console.warn("Langsoft: could not read local storage", e);
		}
		return old;
	}

	private writeLocal(name: "current-user" | "device-id", value: string) {
		try {
			this.app.saveLocalStorage(`langsoft-${name}`, value);
		} catch (e) {
			console.warn("Langsoft: could not save to local storage", e);
		}
	}


	private async loadCurrentUser() {
		const stored = this.readLocal("current-user");
		if (stored) {
			this.currentUser = stored;
		} else if (this.settings.currentUser) {
			// carry over the user set in data.json by older versions
			this.storeCurrentUser(this.settings.currentUser);
		}
		if (this.settings.currentUser !== undefined) {
			delete this.settings.currentUser;
			await this.saveData(this.settings);
		}
	}

	/** The users that have a dictionary. */
	async listUsers(): Promise<string[]> {
		await this.dictManager.getDictionaryFolder();
		await this.dictManager.scanSources();
		return this.dictManager.listUsers();
	}

	/** Create an empty dictionary for a new user. Leaves an existing one alone. */
	async createUser(name: string) {
		await this.dictManager.createUser(name);
	}

	/** Make `name` the current user on this device and load their dictionary. */
	async switchUser(name: string) {
		// finish saving the previous user's changes to their own dictionary first
		await this.dictManager.flush();
		this.storeCurrentUser(name);
		this.SelectedText = [];
		await this.dictManager.init();
		this.getDefiner()?.handleSelection("", "");
		this.updateStatusBar();
	}

	openUserPicker(onDone?: () => void) {
		new UserModal(this.app, this, onDone).open();
	}

	updateStatusBar() {
		this.statusBarEl?.setText(this.currentUser ? `Langsoft: ${this.currentUser}` : "Langsoft: choose user");
	}

	private loadDeviceId() {
		let id = this.readLocal("device-id");
		if (!id || !/^[a-z]+-[0-9a-f]{8}$/.test(id)) {
			const bytes = window.crypto.getRandomValues(new Uint8Array(4));
			const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
			id = `${Platform.isMobile ? "mobile" : "desktop"}-${hex}`;
			this.writeLocal("device-id", id);
		}
		this.deviceId = id;
	}

	/** Remember the user on this device. Does not reload the dictionaries; see switchUser. */
	storeCurrentUser(name: string) {
		this.currentUser = name;
		this.writeLocal("current-user", name);
	}

	wordHover = hoverTooltip((view, pos, side) => {
		const line = view.state.doc.lineAt(pos);
		const match = findWordAt(line.text, pos - line.from);
		if (!match) return null;

		const word = termKey(match.text);
		const def = this.dictManager.userDict[word];
		if (!def || def.highlight === "None") return null;

		const defs = Object.entries(def.definitions)
			.filter(([, v]) => !v.deleted)
			.map(([k]) => k);

		return {
			pos: line.from + match.from,
			end: line.from + match.to,
			above: true,
			strictSide: true,
			create() {
				const dom = createDiv({ cls: ["tooltip", "tooltip-adjusted"] });
				dom.textContent = defs.join(" / ");
				return { dom };
			},
		};
	});


	/** Open the Definer sidebar if needed, and return it once it is ready. */
	async activateView(): Promise<DefinerView | null> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_DEFINER);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: VIEW_TYPE_DEFINER, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		// newer Obsidian versions return a promise here and only load the view once revealed
		void workspace.revealLeaf(leaf);
		return this.getDefinerViewLeaf();
	}


	getContextForSelection(editor: Editor) {
		// the end of the selection, whichever way it was made
		const cursor = editor.getCursor("to");
		return buildSelectionContext(editor.getLine(cursor.line), cursor.ch, editor.getSelection());
	}

	parseIntoWords(text: string, offset: number) {
		return splitIntoWords(text, offset);
	}

	onunload() {
		for (const doc of this.openDocuments()) {
			for (const name of LangsoftPlugin.COLOUR_VARIABLES) doc.body.style.removeProperty(name);
		}
	}

}


