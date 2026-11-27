import { App, debounce, ItemView, Menu, Modal, moment, normalizePath, Notice, Platform, Setting, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type LangsoftPlugin from "main";
import {
	buildRows,
	filterRows,
	findView,
	GridFilter,
	GridLevel,
	GridRow,
	GroupBy,
	groupRows,
	SearchScope,
	planDefinitionEdit,
	SortKey,
	sortRows,
	toCsv,
	viewCounts,
	VIEWS,
} from "dictionary-grid";
import { listBackups } from "backup";
import { backupNow, formatBackupDate, openRestore } from "backup-modal";
import { splitContext } from "words";

export const VIEW_TYPE_GRID = "langsoft-dictionary";

const LEVEL_NAMES: Record<GridLevel, string> = { unknown: "Unknown", semiknown: "Semi", known: "Known", coworker: "Teammates" };

const COLUMNS: { key: SortKey | null; name: string }[] = [
	{ key: "term", name: "Word" },
	{ key: "level", name: "Level" },
	{ key: "definitions", name: "Definitions" },
	{ key: null, name: "Sentence" },
	{ key: "note", name: "Note" },
	{ key: "added", name: "Added" },
	{ key: "changed", name: "Last change" },
	{ key: "changes", name: "Changes" },
	{ key: "teammates", name: "Teammates" },
];

const GROUPS: [GroupBy, string][] = [
	["none", "No grouping"],
	["level", "By level"],
	["note", "By note"],
	["month", "By month added"],
	["letter", "By first letter"],
];

const SCOPES: [SearchScope, string][] = [
	["all", "in everything"],
	["word", "in words"],
	["definition", "in definitions"],
	["sentence", "in sentences"],
];

/** How long "… Undo" stays, in milliseconds. */
const UNDO_TIME = 15000;

/** Rows drawn above and below the visible ones, so fast scrolling doesn't show gaps. */
const OVERSCAN = 8;

type Item = { kind: "group"; key: string; label: string; count: number } | { kind: "row"; row: GridRow };

interface GridState {
	view: string;
	sort: SortKey;
	descending: boolean;
	group: GroupBy;
	scope: SearchScope;
	levels: string[];
	includeTeam: boolean;
	/** Only kept in saved views. */
	query?: string;
}

/**
 * "Langsoft: Open dictionary": every entry in a grid, like a spreadsheet,
 * with views, search, level filters, sorting and grouping. Only the rows
 * on screen are drawn, so it stays quick for any number of words. On
 * phones the rows are cards.
 */
export class GridView extends ItemView {
	plugin: LangsoftPlugin;
	private rows: GridRow[] = [];
	private items: Item[] = [];
	private state: GridState = {
		view: "all",
		sort: "term",
		descending: false,
		group: "none",
		scope: "all",
		levels: ["unknown", "semiknown", "known"],
		includeTeam: false,
	};
	private query = "";
	private collapsed = new Set<string>();
	/** The rows currently shown, after filtering and sorting. */
	private shown: GridRow[] = [];
	/** Words selected for a bulk action (yours only). */
	private selected = new Set<string>();
	/** The last selected row, for Shift+click ranges. */
	private anchor: string | null = null;
	/** The word whose definitions are being edited, if any. */
	private editing: string | null = null;
	private undo: { message: string; run: () => void } | null = null;
	private undoTimer: number | undefined;
	private actionsEl: HTMLElement;

	private viewsEl: HTMLElement;
	private toolbarEl: HTMLElement;
	private statusEl: HTMLElement;
	private scroller: HTMLElement;
	private header: HTMLElement | null = null;
	private body: HTMLElement;
	private drawn = { from: -1, to: -1 };

	constructor(leaf: WorkspaceLeaf, plugin: LangsoftPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_GRID;
	}

	getDisplayText() {
		return "Langsoft dictionary";
	}

	getIcon() {
		return "table";
	}

	/** Height of one row (or card, on phones) in pixels; every item has the same height. */
	private get itemHeight() {
		return Platform.isPhone ? 92 : 34;
	}

	getState(): Record<string, unknown> {
		return { ...this.state };
	}

	async setState(state: unknown, result: ViewStateResult) {
		if (state && typeof state === "object") this.state = { ...this.state, ...(state as Partial<GridState>) };
		await super.setState(state, result);
		if (this.body) this.refilter();
	}

	async onOpen() {
		const el = this.contentEl;
		el.empty();
		el.addClass("langsoft-grid");
		el.toggleClass("is-phone", Platform.isPhone);

		const layout = el.createDiv({ cls: "langsoft-grid-layout" });
		this.viewsEl = layout.createDiv({ cls: "langsoft-grid-views" });
		const main = layout.createDiv({ cls: "langsoft-grid-main" });
		this.toolbarEl = main.createDiv({ cls: "langsoft-grid-toolbar" });
		this.scroller = main.createDiv({ cls: "langsoft-grid-scroller" });
		if (!Platform.isPhone) this.header = this.scroller.createDiv({ cls: "langsoft-grid-row langsoft-grid-header" });
		this.body = this.scroller.createDiv({ cls: "langsoft-grid-body" });
		this.actionsEl = main.createDiv({ cls: "langsoft-grid-actions" });
		this.statusEl = main.createDiv({ cls: "langsoft-grid-status" });

		this.registerDomEvent(this.scroller, "scroll", () => window.requestAnimationFrame(() => this.drawVisible()));
		this.registerEvent(this.app.workspace.on("resize", () => this.drawVisible(true)));

		this.renderToolbar();
		this.refresh();
	}

	/** Rebuild the rows from the dictionaries, e.g. after a change; keeps the scroll position. */
	refresh() {
		if (!this.body) return;
		this.rows = buildRows(this.plugin.dictManager.userDict, this.plugin.dictManager.otherDicts);
		// forget selected words that are gone (e.g. deleted)
		const mine = new Set(this.rows.filter((r) => r.level !== "coworker").map((r) => r.term));
		for (const term of this.selected) if (!mine.has(term)) this.selected.delete(term);
		this.renderViews();
		this.refilter();
	}

	/** Filter, sort and group the rows again, and redraw. */
	private refilter() {
		const filter: GridFilter = {
			view: this.state.view,
			levels: new Set(this.state.levels),
			includeTeam: this.state.includeTeam,
			query: this.query,
			scope: this.state.scope,
		};
		const rows = sortRows(filterRows(this.rows, filter), this.state.sort, this.state.descending);
		this.shown = rows;
		this.items = [];
		for (const group of groupRows(rows, this.state.group)) {
			if (this.state.group !== "none") {
				this.items.push({ kind: "group", key: group.key, label: group.label, count: group.rows.length });
				if (this.collapsed.has(group.key)) continue;
			}
			for (const row of group.rows) this.items.push({ kind: "row", row });
		}

		const own = this.rows.filter((r) => r.level !== "coworker").length;
		this.statusEl.setText(
			rows.length === 0
				? this.rows.length === 0
					? "No words with a definition yet."
					: "Nothing matches. Try another view, level or search."
				: `Showing ${rows.length.toLocaleString()} · ${own.toLocaleString()} words and phrases of yours`
		);
		this.renderHeader();
		this.renderViews();
		this.renderActions();
		this.drawVisible(true);
	}

	// --- side bar of views ------------------------------------------------------------

	private renderViews() {
		const el = this.viewsEl;
		el.empty();
		const counts = viewCounts(this.rows);
		if (Platform.isPhone) {
			const select = el.createEl("select", { cls: "dropdown" });
			for (const view of VIEWS) {
				select.createEl("option", { value: view.id, text: `${view.name} (${counts[view.id]})` });
			}
			for (const [i, saved] of this.savedViews().entries()) {
				select.createEl("option", { value: `saved:${i}`, text: `★ ${saved.name}` });
			}
			select.createEl("option", { value: "save", text: "+ Save current view…" });
			select.createEl("option", { value: "backup", text: "Back up now" });
			select.createEl("option", { value: "restore", text: "Restore from a backup…" });
			select.value = this.state.view;
			select.addEventListener("change", () => {
				const value = select.value;
				select.value = this.state.view;
				if (value === "save") this.saveCurrentView();
				else if (value === "backup") backupNow(this.plugin);
				else if (value === "restore") openRestore(this.plugin);
				else if (value.startsWith("saved:")) this.applySaved(this.savedViews()[Number(value.slice(6))]?.state ?? {});
				else this.setView(value);
			});
			return;
		}
		for (const section of ["mine", "team"] as const) {
			el.createDiv({ cls: "langsoft-grid-views-heading", text: section === "mine" ? "Views" : "Team" });
			for (const view of VIEWS.filter((v) => v.section === section)) {
				const item = el.createDiv({ cls: "langsoft-grid-view-item" });
				item.toggleClass("is-active", view.id === this.state.view);
				item.createSpan({ text: view.name });
				item.createSpan({ cls: "langsoft-grid-count", text: counts[view.id].toLocaleString() });
				item.addEventListener("click", () => this.setView(view.id));
			}
		}
		this.renderSavedViews(el);
		this.renderBackups(el);
	}

	/** The last backup, and buttons to back up and restore, at the bottom of the side bar. */
	private renderBackups(el: HTMLElement) {
		el.createDiv({ cls: "langsoft-grid-views-heading", text: "Backups" });
		const last = el.createDiv({ cls: "langsoft-grid-backup-info", text: "…" });
		listBackups(this.app.vault.adapter, this.plugin.currentUser).then((backups) => {
			last.setText(backups.length ? `Last: ${formatBackupDate(backups[0].date)} · ${backups.length} kept` : "None yet");
		});
		const backup = el.createDiv({ cls: "langsoft-grid-view-item", text: "Back up now" });
		backup.addEventListener("click", async () => {
			await backupNow(this.plugin);
			this.renderViews();
		});
		const restore = el.createDiv({ cls: "langsoft-grid-view-item", text: "Restore from a backup…" });
		restore.addEventListener("click", () => openRestore(this.plugin));
	}

	private savedViews() {
		const all = this.plugin.settings.savedGridViews ?? {};
		return all[this.plugin.currentUser] ?? [];
	}

	private async storeSavedViews(views: { name: string; state: Record<string, unknown> }[]) {
		this.plugin.settings.savedGridViews = { ...(this.plugin.settings.savedGridViews ?? {}), [this.plugin.currentUser]: views };
		await this.plugin.saveSettings();
		this.renderViews();
	}

	/** Saved views at the end of the side bar (on phones they are in the view menu: see renderViews). */
	private renderSavedViews(el: HTMLElement) {
		const views = this.savedViews();
		el.createDiv({ cls: "langsoft-grid-views-heading", text: "Saved" });
		for (const [i, saved] of views.entries()) {
			const item = el.createDiv({ cls: "langsoft-grid-view-item" });
			item.createSpan({ text: saved.name });
			const remove = item.createSpan({ cls: "langsoft-grid-remove", text: "✕" });
			remove.setAttribute("aria-label", "Remove this saved view");
			remove.addEventListener("click", (event) => {
				event.stopPropagation();
				this.storeSavedViews(views.filter((_, j) => j !== i));
			});
			item.addEventListener("click", () => this.applySaved(saved.state));
		}
		const add = el.createDiv({ cls: "langsoft-grid-view-item langsoft-grid-save", text: "+ Save current view" });
		add.addEventListener("click", () => this.saveCurrentView());
	}

	private saveCurrentView() {
		new NameModal(this.app, "Save view", "Name", "", (name) => {
			const views = this.savedViews().filter((v) => v.name !== name);
			this.storeSavedViews([...views, { name, state: { ...this.state, query: this.query } }]);
		}).open();
	}

	private applySaved(state: Record<string, unknown>) {
		const { query, ...rest } = state as Partial<GridState>;
		this.state = { ...this.state, ...rest, view: findView(rest.view).id };
		this.query = typeof query === "string" ? query : "";
		this.collapsed.clear();
		this.scroller.scrollTop = 0;
		this.renderToolbar();
		this.refilter();
	}

	private setView(id: string) {
		this.state.view = findView(id).id;
		this.collapsed.clear();
		this.scroller.scrollTop = 0;
		this.renderToolbar();
		this.refilter();
	}

	// --- toolbar --------------------------------------------------------------------

	private renderToolbar() {
		const el = this.toolbarEl;
		el.empty();

		const search = el.createDiv({ cls: "langsoft-grid-search" });
		const input = search.createEl("input", { type: "search", placeholder: "Search words, definitions or sentences…", value: this.query });
		const update = debounce(() => {
			this.query = input.value;
			this.scroller.scrollTop = 0;
			this.refilter();
		}, 150, true);
		input.addEventListener("input", update);
		const scope = search.createEl("select", { cls: "dropdown" });
		for (const [value, text] of SCOPES) scope.createEl("option", { value, text });
		scope.value = this.state.scope;
		scope.addEventListener("change", () => {
			this.state.scope = scope.value as SearchScope;
			this.refilter();
		});

		const chips = el.createDiv({ cls: "langsoft-grid-chips" });
		const teamView = this.state.view === "team";
		for (const level of ["unknown", "semiknown", "known"] as const) {
			const on = this.state.levels.includes(level);
			this.chip(chips, LEVEL_NAMES[level], this.colour(level), on, teamView, () => {
				this.state.levels = on ? this.state.levels.filter((l) => l !== level) : [...this.state.levels, level];
				this.renderToolbar();
				this.refilter();
			});
		}
		this.chip(chips, "Teammates' only", this.plugin.settings.coworkerColor, this.state.includeTeam || teamView, teamView, () => {
			this.state.includeTeam = !this.state.includeTeam;
			this.renderToolbar();
			this.refilter();
		});

		const exportAll = el.createEl("button", { text: "Export CSV" });
		exportAll.setAttribute("aria-label", "Save the words shown as a CSV file in your vault");
		exportAll.addEventListener("click", () => this.exportCsv(this.shown));

		const group = el.createEl("select", { cls: "dropdown" });
		for (const [value, text] of GROUPS) group.createEl("option", { value, text });
		group.value = this.state.group;
		group.addEventListener("change", () => {
			this.state.group = group.value as GroupBy;
			this.collapsed.clear();
			this.refilter();
		});

		if (Platform.isPhone) {
			// no column headers to click: sort from a menu
			const sort = el.createEl("select", { cls: "dropdown" });
			for (const column of COLUMNS) {
				if (column.key) sort.createEl("option", { value: column.key, text: `Sort: ${column.name}` });
			}
			sort.value = this.state.sort;
			sort.addEventListener("change", () => this.setSort(sort.value as SortKey));
		}
	}

	private chip(el: HTMLElement, label: string, colour: string, on: boolean, disabled: boolean, toggle: () => void) {
		const chip = el.createEl("button", { cls: "langsoft-grid-chip" });
		chip.createSpan({ cls: "langsoft-grid-dot" }).style.backgroundColor = colour;
		chip.appendText(label);
		chip.toggleClass("is-active", on);
		chip.setAttribute("aria-pressed", String(on));
		chip.disabled = disabled;
		chip.addEventListener("click", toggle);
	}

	private setSort(key: SortKey) {
		if (this.state.sort === key) this.state.descending = !this.state.descending;
		else {
			this.state.sort = key;
			// newest and most first, for dates and counts
			this.state.descending = ["added", "changed", "changes", "teammates"].includes(key);
		}
		this.refilter();
	}

	// --- grid ---------------------------------------------------------------------------

	private renderHeader() {
		if (!this.header) return;
		this.header.empty();
		const mine = this.shown.filter((r) => r.level !== "coworker");
		const all = this.header.createDiv({ cls: "langsoft-grid-cell langsoft-grid-check" });
		const box = all.createEl("input", { type: "checkbox" });
		box.setAttribute("aria-label", "Select all shown");
		box.checked = mine.length > 0 && mine.every((r) => this.selected.has(r.term));
		box.indeterminate = !box.checked && mine.some((r) => this.selected.has(r.term));
		box.addEventListener("change", () => {
			for (const row of mine) {
				if (box.checked) this.selected.add(row.term);
				else this.selected.delete(row.term);
			}
			this.afterSelection();
		});
		for (const column of COLUMNS) {
			const cell = this.header.createDiv({ cls: "langsoft-grid-cell", text: column.name });
			if (!column.key) continue;
			const key = column.key;
			cell.addClass("is-sortable");
			if (this.state.sort === key) {
				cell.addClass("is-sorted");
				cell.appendText(this.state.descending ? " ▼" : " ▲");
			}
			cell.addEventListener("click", () => this.setSort(key));
		}
	}

	/** Draw the items in view, if they changed (or always, with `force`). */
	private drawVisible(force = false) {
		if (!this.body) return;
		const height = this.itemHeight;
		this.body.style.height = `${this.items.length * height}px`;
		const headerHeight = this.header?.offsetHeight ?? 0;
		const top = Math.max(0, this.scroller.scrollTop - headerHeight);
		const from = Math.max(0, Math.floor(top / height) - OVERSCAN);
		const to = Math.min(this.items.length, Math.ceil((top + this.scroller.clientHeight) / height) + OVERSCAN);
		if (!force && from === this.drawn.from && to === this.drawn.to) return;
		this.drawn = { from, to };

		this.body.empty();
		for (let i = from; i < to; i++) {
			const item = this.items[i];
			const el =
				item.kind === "group"
					? this.drawGroup(item)
					: Platform.isPhone
						? this.drawCard(item.row)
						: this.drawRow(item.row);
			el.style.top = `${i * height}px`;
			el.style.height = `${height}px`;
		}
	}

	private drawGroup(item: Extract<Item, { kind: "group" }>): HTMLElement {
		const el = this.body.createDiv({ cls: "langsoft-grid-group" });
		const closed = this.collapsed.has(item.key);
		el.setText(`${closed ? "▸" : "▾"} ${item.label}`);
		el.createSpan({ cls: "langsoft-grid-count", text: item.count.toLocaleString() });
		el.addEventListener("click", () => {
			if (closed) this.collapsed.delete(item.key);
			else this.collapsed.add(item.key);
			this.refilter();
		});
		return el;
	}

	private drawRow(row: GridRow): HTMLElement {
		const el = this.body.createDiv({ cls: "langsoft-grid-row" });
		el.toggleClass("is-selected", this.selected.has(row.term));
		const cell = (cls = "") => el.createDiv({ cls: `langsoft-grid-cell ${cls}` });

		this.checkbox(cell("langsoft-grid-check"), row);
		this.wordButton(cell("langsoft-grid-word"), row);
		this.levelPill(cell(), row);
		this.definitions(cell("langsoft-grid-definitions"), row);
		this.sentence(cell("langsoft-grid-muted"), String(row.details.sentence ?? ""));
		this.note(cell("langsoft-grid-muted"), row);
		this.text(cell("langsoft-grid-muted langsoft-grid-number"), this.date(row.added));
		this.text(cell("langsoft-grid-muted langsoft-grid-number"), this.date(row.changed));
		this.text(cell("langsoft-grid-muted langsoft-grid-number"), row.level === "coworker" ? "" : String(row.changes));
		const team = cell("langsoft-grid-team");
		this.text(team, row.teammates.join(", "));
		team.style.color = this.plugin.settings.coworkerColor;
		return el;
	}

	private drawCard(row: GridRow): HTMLElement {
		const el = this.body.createDiv({ cls: "langsoft-grid-card" });
		el.toggleClass("is-selected", this.selected.has(row.term));
		const top = el.createDiv({ cls: "langsoft-grid-card-top" });
		this.checkbox(top, row);
		this.wordButton(top, row);
		top.createSpan({ cls: "langsoft-definer-spacer" });
		this.levelPill(top, row);
		this.definitions(el.createDiv({ cls: "langsoft-grid-card-line" }), row);
		const meta = el.createDiv({ cls: "langsoft-grid-card-line langsoft-grid-muted" });
		this.note(meta, row);
		const date = this.date(row.added);
		if (date) meta.appendText(`${row.details.file ? " · " : ""}${date}`);
		if (row.teammates.length) {
			const team = meta.createSpan({ text: ` · ${row.teammates.join(", ")}` });
			team.style.color = this.plugin.settings.coworkerColor;
		}
		return el;
	}

	// --- cell contents ------------------------------------------------------------------

	private wordButton(el: HTMLElement, row: GridRow) {
		const word = el.createEl("a", { cls: `langsoft-grid-term ${row.level === "coworker" ? "coworker" : row.level}`, text: row.term });
		word.setAttribute("title", "Open in the Definer");
		word.addEventListener("click", async (event) => {
			event.preventDefault();
			const definer = await this.plugin.openDefiner();
			definer?.handleSelection(row.term, "");
		});
		if (row.phrase && !Platform.isPhone) el.createSpan({ cls: "langsoft-grid-tag", text: "phrase" });
	}

	private checkbox(el: HTMLElement, row: GridRow) {
		// teammates' words aren't yours to change
		if (row.level === "coworker") return;
		const box = el.createEl("input", { type: "checkbox" });
		box.checked = this.selected.has(row.term);
		box.setAttribute("aria-label", `Select ${row.term}`);
		box.addEventListener("click", (event) => {
			// Shift+click selects everything shown between the last one clicked and this one
			if (event.shiftKey && this.anchor) {
				const terms = this.shown.filter((r) => r.level !== "coworker").map((r) => r.term);
				const [a, b] = [terms.indexOf(this.anchor), terms.indexOf(row.term)].sort((x, y) => x - y);
				if (a !== -1) for (const term of terms.slice(a, b + 1)) this.selected.add(term);
			} else if (box.checked) {
				this.selected.add(row.term);
			} else {
				this.selected.delete(row.term);
			}
			this.anchor = row.term;
			this.afterSelection();
		});
	}

	/** The level; for your words, click it to change it. */
	private levelPill(el: HTMLElement, row: GridRow) {
		const level = row.level;
		const pill = el.createSpan({ cls: "langsoft-grid-pill", text: LEVEL_NAMES[level] });
		pill.style.backgroundColor = level === "coworker" ? this.plugin.settings.coworkerColor : this.colour(level);
		if (level === "coworker") {
			pill.addClass("is-dark");
			return;
		}
		pill.addClass("is-clickable");
		pill.setAttribute("aria-label", "Change level");
		pill.addEventListener("click", (event) => {
			const menu = new Menu();
			for (const option of ["unknown", "semiknown", "known"] as const) {
				menu.addItem((item) =>
					item
						.setTitle(LEVEL_NAMES[option] === "Semi" ? "Semi-known" : LEVEL_NAMES[option])
						.setChecked(option === level)
						.onClick(() => this.changeLevels([row.term], option))
				);
			}
			menu.showAtMouseEvent(event);
		});
	}

	/** The definitions; for your words, double-click (or long-press on phones) to edit them. */
	private definitions(el: HTMLElement, row: GridRow) {
		const text = row.definitions.join(" / ");
		if (row.level === "coworker" || this.editing !== row.term) {
			this.text(el, text);
			if (row.level !== "coworker") {
				el.addClass("is-editable");
				el.addEventListener("dblclick", () => this.startEditing(row.term));
				el.addEventListener("contextmenu", (event) => {
					if (!Platform.isMobile) return;
					event.preventDefault();
					this.startEditing(row.term);
				});
			}
			return;
		}
		const input = el.createEl("input", { type: "text", cls: "langsoft-grid-edit", value: text });
		input.setAttribute("aria-label", `Definitions of ${row.term}, separated by /`);
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			this.editing = null;
			if (save) {
				const plan = planDefinitionEdit(row.definitions, input.value);
				if (plan) this.plugin.dictManager.editDefinitions(row.term, plan);
				else if (!input.value.split("/").some((d) => d.trim())) new Notice("Langsoft: a word needs a definition. To remove it, select it and use Delete.");
			}
			this.drawVisible(true);
		};
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.isComposing) {
				event.preventDefault();
				finish(true);
			} else if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				finish(false);
			}
		});
		input.addEventListener("blur", () => finish(true));
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	private startEditing(term: string) {
		this.editing = term;
		this.drawVisible(true);
	}

	// --- several words at once -------------------------------------------------------

	private afterSelection() {
		this.renderHeader();
		this.renderActions();
		this.drawVisible(true);
	}

	/** The bar for the selected words, or the "… Undo" message after a change. */
	private renderActions() {
		const el = this.actionsEl;
		el.empty();
		const count = this.selected.size;
		el.toggle(count > 0 || this.undo !== null);
		if (this.undo) {
			const undo = this.undo;
			const bar = el.createDiv({ cls: "langsoft-grid-undo" });
			bar.createSpan({ text: undo.message });
			const button = bar.createEl("a", { text: "Undo", href: "#" });
			button.addEventListener("click", (event) => {
				event.preventDefault();
				this.clearUndo();
				undo.run();
			});
		}
		if (count === 0) return;
		const bar = el.createDiv({ cls: "langsoft-grid-bulk" });
		bar.createEl("b", { text: `${count.toLocaleString()} selected` });
		for (const level of ["unknown", "semiknown", "known"] as const) {
			const button = bar.createEl("button", { text: `Mark ${level === "semiknown" ? "semi-known" : level}` });
			button.addEventListener("click", () => this.changeLevels([...this.selected], level));
		}
		const remove = bar.createEl("button", { cls: "mod-warning", text: "Delete…" });
		remove.addEventListener("click", () => this.deleteSelected());
		const exportButton = bar.createEl("button", { text: "Export CSV" });
		exportButton.addEventListener("click", () => this.exportCsv(this.shown.filter((r) => this.selected.has(r.term))));
		const clear = bar.createEl("a", { text: "Clear selection", href: "#" });
		clear.addEventListener("click", (event) => {
			event.preventDefault();
			this.selected.clear();
			this.afterSelection();
		});
	}

	private changeLevels(terms: string[], level: "unknown" | "semiknown" | "known") {
		const changed = this.plugin.dictManager.setLevels(terms, level);
		if (changed.length === 0) return;
		const name = level === "semiknown" ? "semi-known" : level;
		this.offerUndo(`${changed.length === 1 ? `“${changed[0].term}”` : `${changed.length} words`} marked ${name}.`, () =>
			this.plugin.dictManager.restoreLevels(changed)
		);
	}

	private deleteSelected() {
		const terms = [...this.selected];
		new ConfirmModal(
			this.app,
			`Delete ${terms.length === 1 ? `“${terms[0]}”` : `${terms.length} words`}?`,
			"All their definitions are deleted. You can undo this straight afterwards.",
			"Delete",
			() => {
				const deleted = this.plugin.dictManager.deleteWords(terms);
				for (const term of terms) this.selected.delete(term);
				this.offerUndo(`Deleted ${deleted.length === 1 ? `“${deleted[0].term}”` : `${deleted.length} words`}.`, () =>
					this.plugin.dictManager.restoreWords(deleted)
				);
			}
		).open();
	}

	private offerUndo(message: string, run: () => void) {
		this.undo = { message, run };
		window.clearTimeout(this.undoTimer);
		this.undoTimer = window.setTimeout(() => this.clearUndo(), UNDO_TIME);
		this.renderActions();
	}

	private clearUndo() {
		this.undo = null;
		window.clearTimeout(this.undoTimer);
		this.renderActions();
	}

	/** Save rows as a CSV file at the top of the vault, and say where. */
	private async exportCsv(rows: GridRow[]) {
		if (rows.length === 0) return;
		const name = `Langsoft ${this.plugin.currentUser || "export"} ${moment().format("YYYY-MM-DD HHmm")}.csv`.replace(/[\\/:*?"<>|]/g, "-");
		const path = normalizePath(name);
		try {
			await this.app.vault.adapter.write(path, toCsv(rows));
			new Notice(`Langsoft: exported ${rows.length.toLocaleString()} ${rows.length === 1 ? "word" : "words"} to “${path}”.`);
		} catch (e) {
			new Notice(`Langsoft: could not export: ${e}`);
		}
	}

	private text(el: HTMLElement, text: string) {
		el.setText(text);
		if (text) el.setAttribute("title", text);
	}

	private sentence(el: HTMLElement, sentence: string) {
		const parts = splitContext(sentence);
		if (!parts) {
			this.text(el, sentence);
			return;
		}
		const before = parts.before.trim();
		const after = parts.after.trim();
		el.appendText(before ? `${before} ` : "");
		el.createEl("u", { text: parts.selection.trim() });
		el.appendText(after ? ` ${after}` : "");
		el.setAttribute("title", `${before} ${parts.selection.trim()} ${after}`.trim());
	}

	private note(el: HTMLElement, row: GridRow) {
		const file = row.details.file;
		if (!file) return;
		const link = el.createEl("a", { text: file.replace(/\.md$/, "") });
		link.setAttribute("title", "Go to the sentence");
		link.addEventListener("click", (event) => {
			event.preventDefault();
			this.plugin.goToDefinitionContext(row.details);
		});
	}

	private date(time: number | null): string {
		return time === null ? "" : moment(time).format("D MMM YY");
	}

	private colour(level: string): string {
		const { settings } = this.plugin;
		return level === "known" ? settings.knownColor : level === "semiknown" ? settings.semiknownColor : settings.unknownColor;
	}

	async onClose() {
		// Nothing to clean up: event handlers are removed with the view.
	}
}

/** Asks for a name. */
class NameModal extends Modal {
	constructor(app: App, private title: string, private label: string, private value: string, private done: (name: string) => void) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.title);
		let value = this.value;
		const submit = () => {
			const name = value.trim();
			if (!name) return;
			this.close();
			this.done(name);
		};
		new Setting(this.contentEl).setName(this.label).addText((text) => {
			text.setValue(value).onChange((v) => (value = v));
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter" && !event.isComposing) {
					event.preventDefault();
					submit();
				}
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Save").setCta().onClick(submit));
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Asks to confirm something that is hard to take back. */
class ConfirmModal extends Modal {
	constructor(app: App, private title: string, private message: string, private action: string, private confirmed: () => void) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(this.title);
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(this.action)
					.setWarning()
					.onClick(() => {
						this.close();
						this.confirmed();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
