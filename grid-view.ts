import { debounce, ItemView, moment, Platform, ViewStateResult, WorkspaceLeaf } from "obsidian";
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
	SortKey,
	sortRows,
	viewCounts,
	VIEWS,
} from "dictionary-grid";
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
			select.value = this.state.view;
			select.addEventListener("change", () => this.setView(select.value));
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
		const cell = (cls = "") => el.createDiv({ cls: `langsoft-grid-cell ${cls}` });

		this.wordButton(cell("langsoft-grid-word"), row);
		this.levelPill(cell(), row.level);
		this.text(cell(), row.definitions.join(" / "));
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
		const top = el.createDiv({ cls: "langsoft-grid-card-top" });
		this.wordButton(top, row);
		this.levelPill(top, row.level);
		this.text(el.createDiv({ cls: "langsoft-grid-card-line" }), row.definitions.join(" / "));
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

	private levelPill(el: HTMLElement, level: GridLevel) {
		const pill = el.createSpan({ cls: "langsoft-grid-pill", text: LEVEL_NAMES[level] });
		pill.style.backgroundColor = level === "coworker" ? this.plugin.settings.coworkerColor : this.colour(level);
		if (level === "coworker") pill.addClass("is-dark");
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
