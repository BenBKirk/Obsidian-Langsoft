import { ItemView, WorkspaceLeaf } from "obsidian";
import type LangsoftPlugin from "main";
import { ActivityCalendar, activityCalendar, computeProgress, dayKey, growthSeries, Level, PeriodKind, PeriodStats } from "progress";
import { MIN_TEAM_SIZE, teamGrowth, teamStats } from "team";

export const VIEW_TYPE_PROGRESS = "langsoft-progress";

const LEVEL_NAMES: Record<Level, string> = { known: "Known", semiknown: "Semi-known", unknown: "Unknown" };
/** Top to bottom in the summary; bottom to top in the growth curve. */
const LEVEL_ORDER: Level[] = ["known", "semiknown", "unknown"];
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
const KIND_NAMES: Record<PeriodKind, string> = { week: "Week", month: "Month", year: "Year" };
const CURRENT_NAMES: Record<PeriodKind, string> = { week: "This week", month: "This month", year: "This year" };

/** "Langsoft: Show progress": the current user's words by level over time. */
export class ProgressView extends ItemView {
	plugin: LangsoftPlugin;
	kind: PeriodKind = "month";
	/** The period shown in the summary, as an index into the periods; null for the current one. */
	selected: number | null = null;
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
		// before the period buttons: it covers the whole last year, whatever period is chosen
		this.renderActivity(el, activityCalendar(dict));

		const switcher = el.createDiv({ cls: "langsoft-progress-kinds" });
		for (const kind of Object.keys(KIND_NAMES) as PeriodKind[]) {
			const button = switcher.createEl("button", { text: KIND_NAMES[kind] });
			button.toggleClass("is-active", kind === this.kind);
			button.addEventListener("click", () => {
				this.kind = kind;
				this.selected = null;
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

		this.renderSummary(el, periods, index);
		this.renderGrowth(el, periods, index);
		this.renderTeam(el, periods);
	}

	private colour(level: Level): string {
		const { settings } = this.plugin;
		return level === "known" ? settings.knownColor : level === "semiknown" ? settings.semiknownColor : settings.unknownColor;
	}

	private select(index: number) {
		this.selected = index;
		this.render();
	}

	/** The selected period's numbers, with buttons to step to the previous or next period. */
	private renderSummary(el: HTMLElement, periods: PeriodStats[], index: number) {
		const period = periods[index];
		const isCurrent = index === periods.length - 1;
		const summary = el.createDiv({ cls: "langsoft-progress-summary" });

		const heading = summary.createDiv({ cls: "langsoft-progress-period" });
		const previous = heading.createEl("button", { text: "‹", attr: { "aria-label": "Previous period" } });
		previous.disabled = index === 0;
		previous.addEventListener("click", () => this.select(index - 1));
		heading.createEl("h3", { text: isCurrent ? `${CURRENT_NAMES[this.kind]} (${period.label})` : period.label });
		const next = heading.createEl("button", { text: "›", attr: { "aria-label": "Next period" } });
		next.disabled = isCurrent;
		next.addEventListener("click", () => this.select(index + 1));

		const table = summary.createEl("table");
		const head = table.createEl("tr");
		head.createEl("th");
		head.createEl("th", { text: isCurrent ? "Now" : "At the end" });
		head.createEl("th", { text: "Reached in this period" });
		for (const level of LEVEL_ORDER) {
			const row = table.createEl("tr");
			const name = row.createEl("td");
			name.createSpan({ cls: "langsoft-progress-swatch" }).setCssStyles({ backgroundColor: this.colour(level) });
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

	/**
	 * Stacked areas of the words at each level over time, known at the
	 * bottom, with the periods marked. Click or tap a period to select it.
	 */
	private renderGrowth(el: HTMLElement, periods: PeriodStats[], selected: number) {
		const series = growthSeries(this.plugin.dictManager.userDict, this.kind);
		if (series.length < 2) return;
		el.createEl("h3", { text: "Growth" });

		const width = 600;
		const height = 240;
		const margin = { top: 10, right: 12, bottom: 24, left: 44 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const first = series[0].time.getTime();
		const lastTime = series[series.length - 1].time.getTime();
		const totalOf = (t: Record<Level, number>) => LEVEL_ORDER.reduce((sum, level) => sum + t[level], 0);
		const max = niceMax(Math.max(1, ...series.map((p) => totalOf(p.totals))));
		const x = (time: number) => margin.left + ((Math.min(time, lastTime) - first) / Math.max(1, lastTime - first)) * plotWidth;
		const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;

		const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "langsoft-growth", role: "img" });
		const latest = series[series.length - 1].totals;
		// described with <title>, not aria-label: Obsidian shows a tooltip for anything with an
		// aria-label, and its tooltip code fails on SVG elements ("isShown is not a function")
		svg("title", {}, chart).textContent =
			`Words by level over time. Now: ${LEVEL_ORDER.map((l) => `${LEVEL_NAMES[l]} ${latest[l]}`).join(", ")}`;

		// the selected period, shaded behind the curve
		const period = periods[selected];
		svg(
			"rect",
			{
				x: x(period.start.getTime()),
				y: margin.top,
				width: Math.max(2, x(period.end.getTime()) - x(period.start.getTime())),
				height: plotHeight,
				class: "langsoft-growth-selected",
			},
			chart
		);

		// grid lines and their values
		for (const value of [0, max / 4, max / 2, (3 * max) / 4, max].filter(Number.isInteger)) {
			svg("line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: "langsoft-growth-grid" }, chart);
			const text = svg("text", { x: margin.left - 6, y: y(value) + 4, "text-anchor": "end" }, chart);
			text.textContent = String(value);
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

		// where each period starts, labelled along the bottom; fewer labels if they'd be crowded
		const every = Math.ceil(periods.length / Math.max(1, Math.floor(plotWidth / 48)));
		for (const [i, p] of periods.entries()) {
			const px = x(p.start.getTime());
			if (i > 0) svg("line", { x1: px, x2: px, y1: margin.top, y2: margin.top + plotHeight, class: "langsoft-growth-period" }, chart);
			if (i % every !== 0 && i !== selected) continue;
			const middle = (px + x(p.end.getTime())) / 2;
			const text = svg("text", { x: middle, y: height - 6, "text-anchor": "middle" }, chart);
			text.textContent = shortLabel(p, this.kind);
			if (i === selected) text.classList.add("is-selected");
		}

		// click or tap a period to select it
		chart.addEventListener("click", (event: MouseEvent) => {
			const box = chart.getBoundingClientRect();
			const viewX = ((event.clientX - box.left) / box.width) * width;
			const time = first + ((viewX - margin.left) / plotWidth) * (lastTime - first);
			const index = periods.findIndex((p) => time >= p.start.getTime() && time < p.end.getTime());
			if (index !== -1) this.select(index);
		});
		el.appendChild(chart);

		const legend = el.createDiv({ cls: "langsoft-progress-legend" });
		for (const level of LEVEL_ORDER) {
			const item = legend.createSpan();
			item.createSpan({ cls: "langsoft-progress-swatch" }).setCssStyles({ backgroundColor: this.colour(level) });
			item.appendText(LEVEL_NAMES[level]);
		}
		legend.createSpan({ cls: "langsoft-progress-hint", text: "Click a period to see its numbers above." });
	}

	/**
	 * Figures about the whole team, never about one person, and only with at
	 * least MIN_TEAM_SIZE people: with fewer, they would give away a
	 * teammate's own figures.
	 */
	private renderTeam(el: HTMLElement, periods: PeriodStats[]) {
		const { userDict, otherDicts } = this.plugin.dictManager;
		el.createEl("h3", { text: "Team" });
		const stats = teamStats(userDict, otherDicts);
		if (stats.people < MIN_TEAM_SIZE) {
			el.createEl("p", {
				cls: "langsoft-progress-hint",
				text: `Team figures appear when at least ${MIN_TEAM_SIZE} people share dictionaries, so nobody's own figures can be worked out from them.`,
			});
			return;
		}

		const number = (n: number) => n.toLocaleString();
		const table = el.createEl("table", { cls: "langsoft-team-table" });
		const row = (label: string, value: number, colour?: string) => {
			const tr = table.createEl("tr");
			const name = tr.createEl("td");
			if (colour) name.createSpan({ cls: "langsoft-progress-swatch" }).setCssStyles({ backgroundColor: colour });
			name.appendText(label);
			tr.createEl("td", { cls: "langsoft-progress-number", text: number(value) });
		};
		row(`Words defined by the ${stats.people} of you`, stats.vocabulary, this.plugin.settings.coworkerColor);
		row("Known by at least one person", stats.knownBySomeone, this.colour("known"));
		row("Defined by teammates, not yet by you", stats.teammatesOnly);
		el.createEl("p", {
			cls: "langsoft-progress-hint",
			text: 'Words only teammates have defined show up in your notes in the coworker colour; "Langsoft: Search definitions" finds them by meaning.',
		});

		this.renderTeamGrowth(el, periods);
	}

	/** The team's combined vocabulary over time: known by someone at the bottom, the rest above. */
	private renderTeamGrowth(el: HTMLElement, periods: PeriodStats[]) {
		const { userDict, otherDicts } = this.plugin.dictManager;
		const series = teamGrowth(userDict, otherDicts, this.kind);
		if (series.length < 2) return;

		const width = 600;
		const height = 200;
		const margin = { top: 10, right: 12, bottom: 24, left: 44 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const first = series[0].time.getTime();
		const lastTime = series[series.length - 1].time.getTime();
		const max = niceMax(Math.max(1, ...series.map((p) => p.vocabulary)));
		const x = (time: number) => margin.left + ((Math.min(time, lastTime) - first) / Math.max(1, lastTime - first)) * plotWidth;
		const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;

		const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "langsoft-growth langsoft-team-growth", role: "img" });
		const latest = series[series.length - 1];
		// a <title>, not aria-label: see renderGrowth
		svg("title", {}, chart).textContent =
			`The team's words over time. Now: ${latest.vocabulary} defined, ${latest.knownBySomeone} known by at least one person`;

		for (const value of [0, max / 4, max / 2, (3 * max) / 4, max].filter(Number.isInteger)) {
			svg("line", { x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: "langsoft-growth-grid" }, chart);
			svg("text", { x: margin.left - 6, y: y(value) + 4, "text-anchor": "end" }, chart).textContent = String(value);
		}

		const area = (lower: number[], upper: number[], colour: string) => {
			const top = series.map((p, i) => `${x(p.time.getTime())},${y(upper[i])}`);
			const bottom = series.map((p, i) => `${x(p.time.getTime())},${y(lower[i])}`).reverse();
			svg("polygon", { points: [...top, ...bottom].join(" "), fill: colour, class: "langsoft-growth-area" }, chart);
		};
		const known = series.map((p) => p.knownBySomeone);
		area(series.map(() => 0), known, this.colour("known"));
		area(known, series.map((p) => p.vocabulary), this.plugin.settings.coworkerColor);

		const every = Math.ceil(periods.length / Math.max(1, Math.floor(plotWidth / 48)));
		for (const [i, p] of periods.entries()) {
			const px = x(p.start.getTime());
			if (i > 0) svg("line", { x1: px, x2: px, y1: margin.top, y2: margin.top + plotHeight, class: "langsoft-growth-period" }, chart);
			if (i % every !== 0) continue;
			svg("text", { x: (px + x(p.end.getTime())) / 2, y: height - 6, "text-anchor": "middle" }, chart).textContent = shortLabel(p, this.kind);
		}
		el.appendChild(chart);

		const legend = el.createDiv({ cls: "langsoft-progress-legend" });
		for (const [label, colour] of [
			["Known by at least one person", this.colour("known")],
			["Defined, not yet known by anyone", this.plugin.settings.coworkerColor],
		]) {
			const item = legend.createSpan();
			item.createSpan({ cls: "langsoft-progress-swatch" }).setCssStyles({ backgroundColor: colour });
			item.appendText(label);
		}
	}

	/** A square per day for the last year, shaded by how much was done. */
	private renderActivity(el: HTMLElement, calendar: ActivityCalendar) {
		el.createEl("h3", { text: "Activity" });
		const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
		el.createEl("p", {
			cls: "langsoft-activity-summary",
			text:
				`Current streak: ${plural(calendar.currentStreak, "day")} · ` +
				`Longest streak: ${plural(calendar.longestStreak, "day")} · ` +
				`Active on ${calendar.activeDays} of the last ${calendar.days.length} days`,
		});

		const scroller = el.createDiv({ cls: "langsoft-activity-scroller" });
		const grid = scroller.createDiv({ cls: "langsoft-activity-grid" });
		const weeks = Math.ceil(calendar.days.length / 7);
		grid.setCssStyles({ gridTemplateColumns: `28px repeat(${weeks}, 11px)` });

		// Mon, Wed, Fri down the side
		for (const [row, name] of WEEKDAYS.entries()) {
			if (!name) continue;
			const label = grid.createDiv({ cls: "langsoft-activity-weekday", text: name });
			label.setCssStyles({ gridRow: String(row + 2) });
		}

		// month names along the top, over the week a month starts in
		let lastLabelWeek = -10;
		for (let week = 0; week < weeks; week++) {
			const days = calendar.days.slice(week * 7, week * 7 + 7);
			const firstDay = week === 0 ? days[0] : days.find((d) => d.date.getDate() === 1);
			// at least three weeks apart, so the names don't overlap
			if (!firstDay || week - lastLabelWeek < 3) continue;
			const month = grid.createDiv({ cls: "langsoft-activity-month", text: MONTH_NAMES[firstDay.date.getMonth()] });
			month.setCssStyles({ gridColumn: `${week + 2} / span 3` });
			lastLabelWeek = week;
		}

		const today = dayKey(new Date());
		for (const [i, day] of calendar.days.entries()) {
			const shade = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / Math.max(1, calendar.max)) * 4));
			const cell = grid.createDiv({ cls: `langsoft-activity-day langsoft-activity-${shade}` });
			cell.setCssStyles({ gridColumn: String(Math.floor(i / 7) + 2) });
			cell.setCssStyles({ gridRow: String((i % 7) + 2) });
			cell.toggleClass("is-today", dayKey(day.date) === today);
			// Obsidian shows aria-label as a tooltip, so no title as well
			cell.setAttribute("aria-label", `${day.date.toDateString()}: ${plural(day.count, "change")}`);
		}

		const legend = el.createDiv({ cls: "langsoft-progress-legend" });
		legend.createSpan({ text: "Less" });
		for (let shade = 0; shade <= 4; shade++) legend.createSpan({ cls: `langsoft-activity-day langsoft-activity-${shade}` });
		legend.createSpan({ text: "More" });

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
	const element = activeDocument.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
	parent?.appendChild(element);
	return element;
}

/** A round number at least `value`, for the top of a chart: 1, 2, 4, 5, 10, 20, 40, 50, ... (divisible into quarters where possible) */
function niceMax(value: number): number {
	const power = Math.pow(10, Math.floor(Math.log10(value)));
	for (const step of [1, 2, 4, 5, 10]) {
		if (step * power >= value) return step * power;
	}
	return 10 * power;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A period's label along the bottom of the growth curve. */
function shortLabel(period: PeriodStats, kind: PeriodKind): string {
	if (kind === "month") {
		const month = period.start.getMonth();
		return month === 0 ? String(period.start.getFullYear()) : MONTH_NAMES[month];
	}
	return period.label;
}
