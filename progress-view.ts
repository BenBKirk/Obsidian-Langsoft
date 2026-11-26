import { ItemView, WorkspaceLeaf } from "obsidian";
import type LangsoftPlugin from "main";
import {
	ActivityCalendar,
	activityCalendar,
	computeProgress,
	dayChanges,
	dayKey,
	growthSeries,
	Level,
	PeriodKind,
	periodWords,
	PeriodStats,
} from "progress";

export const VIEW_TYPE_PROGRESS = "langsoft-progress";

const LEVEL_NAMES: Record<Level, string> = { known: "Known", semiknown: "Semi-known", unknown: "Unknown" };
/** Top to bottom in the summary; bottom to top in the bars. */
const LEVEL_ORDER: Level[] = ["known", "semiknown", "unknown"];
/** Height in pixels of the tallest possible bar. */
const BAR_HEIGHT = 164;
/** How many words to list before "show all". */
const WORDS_SHOWN = 30;
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
const KIND_NAMES: Record<PeriodKind, string> = { week: "Week", month: "Month", year: "Year" };
const CURRENT_NAMES: Record<PeriodKind, string> = { week: "This week", month: "This month", year: "This year" };

/** "Langsoft: Show progress": the current user's words by level over time. */
export class ProgressView extends ItemView {
	plugin: LangsoftPlugin;
	kind: PeriodKind = "month";
	/** The period shown in the summary, as an index into the periods; null for the current one. */
	selected: number | null = null;
	/** The calendar day whose words are listed, if any. */
	selectedDay: Date | null = null;
	/** Word lists showing all their words rather than the first few. */
	private expanded = new Set<string>();
	/** How far the calendar is scrolled; null for "at today", which is where it starts. */
	private calendarScroll: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LangsoftPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_PROGRESS;
	}

	getDisplayText() {
		return "Langsoft progress";
	}

	getIcon() {
		return "trending-up";
	}

	async onOpen() {
		this.render();
	}

	render() {
		const el = this.contentEl;
		// redrawn whenever the dictionary changes; stay where the reader is
		const scrollTop = el.scrollTop;
		this.build(el);
		el.scrollTop = scrollTop;
	}

	private build(el: HTMLElement) {
		el.empty();
		el.addClass("langsoft-progress");

		const user = this.plugin.currentUser;
		el.createEl("h2", { text: user ? `Progress: ${user}` : "Progress" });
		if (!user) {
			el.createEl("p", { text: 'Choose who you are first, with the command "Langsoft: Switch user".' });
			return;
		}

		const dict = this.plugin.dictManager.userDict;
		const calendar = activityCalendar(dict);
		this.renderHeadline(el, calendar);
		// before the period buttons: it covers the whole last year, whatever period is chosen
		this.renderActivity(el, calendar);

		const switcher = el.createDiv({ cls: "langsoft-progress-kinds" });
		for (const kind of Object.keys(KIND_NAMES) as PeriodKind[]) {
			const button = switcher.createEl("button", { text: KIND_NAMES[kind] });
			button.toggleClass("is-active", kind === this.kind);
			button.addEventListener("click", () => {
				this.kind = kind;
				this.selected = null;
				this.expanded.clear();
				this.render();
			});
		}

		const periods = computeProgress(dict, this.kind);
		const index = this.selected !== null && this.selected < periods.length ? this.selected : periods.length - 1;
		const current = periods[periods.length - 1];
		if (LEVEL_ORDER.every((level) => current.totals[level] === 0) && periods.every((p) => p.newWords === 0)) {
			el.createEl("p", { cls: "langsoft-progress-empty", text: "No words with a definition yet." });
			return;
		}

		this.renderSummary(el, periods[index], index === periods.length - 1);
		this.renderPeriodWords(el, periods[index]);
		this.renderChart(el, periods, index);
		this.renderGrowth(el);
	}

	private colour(level: Level): string {
		const { settings } = this.plugin;
		return level === "known" ? settings.knownColor : level === "semiknown" ? settings.semiknownColor : settings.unknownColor;
	}

	/** Three numbers to answer "how am I doing?" at a glance. */
	private renderHeadline(el: HTMLElement, calendar: ActivityCalendar) {
		const dict = this.plugin.dictManager.userDict;
		const thisWeek = computeProgress(dict, "week").pop()!;
		const tiles = el.createDiv({ cls: "langsoft-headline" });
		const tile = (value: number, label: string, detail: string, colour?: string) => {
			const t = tiles.createDiv({ cls: "langsoft-headline-tile" });
			const number = t.createDiv({ cls: "langsoft-headline-number", text: String(value) });
			if (colour) number.createSpan({ cls: "langsoft-progress-swatch" }).style.backgroundColor = colour;
			t.createDiv({ cls: "langsoft-headline-label", text: label });
			t.createDiv({ cls: "langsoft-headline-detail", text: detail });
		};
		tile(
			thisWeek.totals.known,
			"known words",
			thisWeek.reached.known > 0 ? `+${thisWeek.reached.known} this week` : "none new this week",
			this.colour("known")
		);
		tile(thisWeek.newWords, "new this week", `${thisWeek.totals.unknown + thisWeek.totals.semiknown + thisWeek.totals.known} words in all`);
		tile(
			calendar.currentStreak,
			calendar.currentStreak === 1 ? "day in a row" : "days in a row",
			`longest: ${calendar.longestStreak}`
		);
	}

	/** Words as buttons that open them in the Definer; long lists show the first few. */
	private renderWords(el: HTMLElement, key: string, words: { term: string; level: Level; isNew?: boolean }[]) {
		const list = el.createDiv({ cls: "langsoft-word-list" });
		const all = this.expanded.has(key);
		for (const word of all ? words : words.slice(0, WORDS_SHOWN)) {
			const chip = list.createEl("button", { cls: "langsoft-word-chip", text: word.term });
			chip.style.borderLeftColor = this.colour(word.level);
			if (word.isNew) chip.createSpan({ cls: "langsoft-word-new", text: "new" });
			chip.setAttribute("aria-label", "Open in the Definer");
			chip.addEventListener("click", async () => {
				const definer = await this.plugin.openDefiner();
				definer?.handleSelection(word.term, "");
			});
		}
		if (!all && words.length > WORDS_SHOWN) {
			const more = list.createEl("button", { cls: "langsoft-word-more", text: `${words.length - WORDS_SHOWN} more…` });
			more.addEventListener("click", () => {
				this.expanded.add(key);
				this.render();
			});
		}
	}

	/** The words behind the selected period's "reached" numbers. */
	private renderPeriodWords(el: HTMLElement, period: PeriodStats) {
		const words = periodWords(this.plugin.dictManager.userDict, period);
		const isNew = new Set(words.newWords);
		const section = el.createDiv({ cls: "langsoft-period-words" });
		for (const level of LEVEL_ORDER) {
			const terms = words.reached[level];
			if (terms.length === 0) continue;
			const heading = section.createDiv({ cls: "langsoft-word-heading" });
			heading.createSpan({ cls: "langsoft-progress-swatch" }).style.backgroundColor = this.colour(level);
			heading.appendText(`Reached ${LEVEL_NAMES[level].toLowerCase()} (${terms.length})`);
			this.renderWords(
				section,
				`${period.label}:${level}`,
				terms.map((term) => ({ term, level, isNew: isNew.has(term) }))
			);
		}
	}

	private renderSummary(el: HTMLElement, period: PeriodStats, isCurrent: boolean) {
		const summary = el.createDiv({ cls: "langsoft-progress-summary" });
		summary.createEl("h3", {
			text: isCurrent ? `${CURRENT_NAMES[this.kind]} (${period.label})` : period.label,
		});
		const table = summary.createEl("table");
		const head = table.createEl("tr");
		head.createEl("th");
		head.createEl("th", { text: isCurrent ? "Now" : "At the end" });
		head.createEl("th", { text: "Reached in this period" });
		for (const level of LEVEL_ORDER) {
			const row = table.createEl("tr");
			const name = row.createEl("td");
			name.createSpan({ cls: "langsoft-progress-swatch" }).style.backgroundColor = this.colour(level);
			name.appendText(LEVEL_NAMES[level]);
			row.createEl("td", { cls: "langsoft-progress-number", text: String(period.totals[level]) });
			row.createEl("td", {
				cls: "langsoft-progress-number",
				text: period.reached[level] > 0 ? `+${period.reached[level]}` : "–",
			});
		}
		const total = LEVEL_ORDER.reduce((sum, level) => sum + period.totals[level], 0);
		const footer = table.createEl("tr", { cls: "langsoft-progress-total" });
		footer.createEl("td", { text: "All words" });
		footer.createEl("td", { cls: "langsoft-progress-number", text: String(total) });
		footer.createEl("td", {
			cls: "langsoft-progress-number",
			text: period.newWords > 0 ? `+${period.newWords} new` : "–",
		});
	}

	private renderChart(el: HTMLElement, periods: PeriodStats[], selected: number) {
		const totalOf = (p: PeriodStats) => LEVEL_ORDER.reduce((sum, level) => sum + p.totals[level], 0);
		const max = Math.max(1, ...periods.map(totalOf));

		const chart = el.createDiv({ cls: "langsoft-progress-chart" });
		for (const [i, period] of periods.entries()) {
			const column = chart.createEl("button", { cls: "langsoft-progress-column" });
			column.toggleClass("is-selected", i === selected);
			const counts = LEVEL_ORDER.map((level) => `${LEVEL_NAMES[level]} ${period.totals[level]}`).join(", ");
			column.setAttribute("aria-label", `${period.label}: ${counts}`);
			column.addEventListener("click", () => {
				this.selected = i;
				this.render();
			});

			const area = column.createDiv({ cls: "langsoft-progress-area" });
			area.createDiv({ cls: "langsoft-progress-bar-total", text: String(totalOf(period)) });
			// sizes in pixels rather than percentages: the column is a button, and themes
			// size buttons in ways that keep percentage heights from working
			const bar = area.createDiv({ cls: "langsoft-progress-bar" });
			// top to bottom: unknown, semi-known, known, so known words build up from the bottom
			for (const level of [...LEVEL_ORDER].reverse()) {
				if (period.totals[level] === 0) continue;
				const segment = bar.createDiv({ cls: "langsoft-progress-segment" });
				segment.style.height = `${Math.max(1, (period.totals[level] / max) * BAR_HEIGHT)}px`;
				segment.style.backgroundColor = this.colour(level);
			}
			column.createDiv({ cls: "langsoft-progress-label", text: period.label });
		}
	}

	/** Stacked areas of the words at each level over time, known at the bottom. */
	private renderGrowth(el: HTMLElement) {
		const series = growthSeries(this.plugin.dictManager.userDict, this.kind);
		if (series.length < 2) return;
		el.createEl("h3", { text: "Growth" });

		const width = 600;
		const height = 220;
		const margin = { top: 10, right: 12, bottom: 24, left: 44 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const first = series[0].time.getTime();
		const lastTime = series[series.length - 1].time.getTime();
		const totalOf = (t: Record<Level, number>) => LEVEL_ORDER.reduce((sum, level) => sum + t[level], 0);
		const max = niceMax(Math.max(1, ...series.map((p) => totalOf(p.totals))));
		const x = (time: number) => margin.left + ((time - first) / Math.max(1, lastTime - first)) * plotWidth;
		const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;

		const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "langsoft-growth", role: "img" });
		const latest = series[series.length - 1].totals;
		// described with <title>, not aria-label: Obsidian shows a tooltip for anything with an
		// aria-label, and its tooltip code fails on SVG elements ("isShown is not a function")
		svg("title", {}, chart).textContent =
			`Words by level over time. Now: ${LEVEL_ORDER.map((l) => `${LEVEL_NAMES[l]} ${latest[l]}`).join(", ")}`;

		// grid lines and their values
		for (const value of [0, max / 2, max].filter(Number.isInteger)) {
			svg("line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: "langsoft-growth-grid" }, chart);
			const text = svg("text", { x: margin.left - 6, y: y(value) + 4, "text-anchor": "end" }, chart);
			text.textContent = String(Math.round(value));
		}

		// known at the bottom, then semi-known, then unknown
		const below = series.map(() => 0);
		for (const level of LEVEL_ORDER) {
			const above = series.map((p, i) => below[i] + p.totals[level]);
			const top = series.map((p, i) => `${x(p.time.getTime())},${y(above[i])}`);
			const bottom = series.map((p, i) => `${x(p.time.getTime())},${y(below[i])}`).reverse();
			svg("polygon", { points: [...top, ...bottom].join(" "), fill: this.colour(level), class: "langsoft-growth-area" }, chart);
			above.forEach((value, i) => (below[i] = value));
		}

		// dates along the bottom: first, middle, last
		const middle = series[Math.floor(series.length / 2)];
		for (const [point, anchor] of [[series[0], "start"], [middle, "middle"], [series[series.length - 1], "end"]] as const) {
			const text = svg("text", { x: x(point.time.getTime()), y: height - 6, "text-anchor": anchor }, chart);
			text.textContent = point === series[series.length - 1] ? "Now" : formatDate(point.time, this.kind);
		}
		el.appendChild(chart);

		const legend = el.createDiv({ cls: "langsoft-progress-legend" });
		for (const level of LEVEL_ORDER) {
			const item = legend.createSpan();
			item.createSpan({ cls: "langsoft-progress-swatch" }).style.backgroundColor = this.colour(level);
			item.appendText(LEVEL_NAMES[level]);
		}
	}

	/** A square per day for the last year, shaded by how much was done; click a day for its words. */
	private renderActivity(el: HTMLElement, calendar: ActivityCalendar) {
		el.createEl("h3", { text: "Activity" });
		const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
		el.createEl("p", {
			cls: "langsoft-activity-summary",
			text: `Active on ${calendar.activeDays} of the last ${calendar.days.length} days. Click a day to see its words.`,
		});

		const scroller = el.createDiv({ cls: "langsoft-activity-scroller" });
		const grid = scroller.createDiv({ cls: "langsoft-activity-grid" });
		const weeks = Math.ceil(calendar.days.length / 7);
		grid.style.gridTemplateColumns = `28px repeat(${weeks}, 11px)`;

		// Mon, Wed, Fri down the side
		for (const [row, name] of WEEKDAYS.entries()) {
			if (!name) continue;
			const label = grid.createDiv({ cls: "langsoft-activity-weekday", text: name });
			label.style.gridColumn = "1";
			label.style.gridRow = String(row + 2);
		}

		// month names along the top, over the week a month starts in
		let lastLabelWeek = -10;
		for (let week = 0; week < weeks; week++) {
			const days = calendar.days.slice(week * 7, week * 7 + 7);
			const first = week === 0 ? days[0] : days.find((d) => d.date.getDate() === 1);
			// at least three weeks apart, so the names don't overlap
			if (!first || week - lastLabelWeek < 3) continue;
			const month = grid.createDiv({ cls: "langsoft-activity-month", text: formatDate(first.date, "year").split(" ")[0] });
			month.style.gridColumn = `${week + 2} / span 3`;
			month.style.gridRow = "1";
			lastLabelWeek = week;
		}

		const today = dayKey(new Date());
		const selected = this.selectedDay ? dayKey(this.selectedDay) : null;
		for (const [i, day] of calendar.days.entries()) {
			const shade = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / Math.max(1, calendar.max)) * 4));
			const cell = grid.createDiv({ cls: `langsoft-activity-day langsoft-activity-${shade}` });
			cell.style.gridColumn = String(Math.floor(i / 7) + 2);
			cell.style.gridRow = String((i % 7) + 2);
			const key = dayKey(day.date);
			cell.toggleClass("is-today", key === today);
			cell.toggleClass("is-selected", key === selected);
			// Obsidian shows aria-label as a tooltip, so no title as well
			cell.setAttribute("aria-label", `${day.date.toDateString()}: ${plural(day.count, "change")}`);
			cell.addEventListener("click", () => {
				this.selectedDay = key === selected ? null : day.date;
				this.render();
			});
		}

		const legend = el.createDiv({ cls: "langsoft-progress-legend" });
		legend.createSpan({ text: "Less" });
		for (let shade = 0; shade <= 4; shade++) legend.createSpan({ cls: `langsoft-activity-day langsoft-activity-${shade}` });
		legend.createSpan({ text: "More" });

		if (this.selectedDay) {
			const changes = dayChanges(this.plugin.dictManager.userDict, this.selectedDay);
			const section = el.createDiv({ cls: "langsoft-day-words" });
			section.createDiv({
				cls: "langsoft-word-heading",
				text: `${this.selectedDay.toDateString()}: ${changes.length === 0 ? "nothing added or changed" : plural(changes.length, "word")}`,
			});
			this.renderWords(section, `day:${dayKey(this.selectedDay)}`, changes);
		}

		// start at today; after a redraw, stay where the reader scrolled to
		scroller.addEventListener("scroll", () => {
			const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
			this.calendarScroll = atEnd ? null : scroller.scrollLeft;
		});
		window.requestAnimationFrame(() => (scroller.scrollLeft = this.calendarScroll ?? scroller.scrollWidth));
	}

	async onClose() {
		// Nothing to clean up.
	}
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag: string, attributes: Record<string, string | number>, parent?: Element): SVGElement {
	const element = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
	parent?.appendChild(element);
	return element;
}

/** A round number at least `value`, for the top of a chart: 1, 2, 5, 10, 20, 50, ... */
function niceMax(value: number): number {
	const power = Math.pow(10, Math.floor(Math.log10(value)));
	for (const step of [1, 2, 5, 10]) {
		if (step * power >= value) return step * power;
	}
	return 10 * power;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(date: Date, kind: PeriodKind): string {
	return kind === "year"
		? `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
		: `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}
