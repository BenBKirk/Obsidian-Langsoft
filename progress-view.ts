import { ItemView, WorkspaceLeaf } from "obsidian";
import type LangsoftPlugin from "main";
import { computeProgress, Level, PeriodKind, PeriodStats } from "progress";

export const VIEW_TYPE_PROGRESS = "langsoft-progress";

const LEVEL_NAMES: Record<Level, string> = { known: "Known", semiknown: "Semi-known", unknown: "Unknown" };
/** Top to bottom in the summary; bottom to top in the bars. */
const LEVEL_ORDER: Level[] = ["known", "semiknown", "unknown"];
const KIND_NAMES: Record<PeriodKind, string> = { week: "Week", month: "Month", year: "Year" };
const CURRENT_NAMES: Record<PeriodKind, string> = { week: "This week", month: "This month", year: "This year" };

/** "Langsoft: Show progress": the current user's words by level over time. */
export class ProgressView extends ItemView {
	plugin: LangsoftPlugin;
	kind: PeriodKind = "month";
	/** The period shown in the summary, as an index into the periods; null for the current one. */
	selected: number | null = null;

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
		el.empty();
		el.addClass("langsoft-progress");

		const user = this.plugin.currentUser;
		el.createEl("h2", { text: user ? `Progress: ${user}` : "Progress" });
		if (!user) {
			el.createEl("p", { text: 'Choose who you are first, with the command "Langsoft: Switch user".' });
			return;
		}

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

		const periods = computeProgress(this.plugin.dictManager.userDict, this.kind);
		const index = this.selected !== null && this.selected < periods.length ? this.selected : periods.length - 1;
		const current = periods[periods.length - 1];
		if (LEVEL_ORDER.every((level) => current.totals[level] === 0) && periods.every((p) => p.newWords === 0)) {
			el.createEl("p", { cls: "langsoft-progress-empty", text: "No words with a definition yet." });
			return;
		}

		this.renderSummary(el, periods[index], index === periods.length - 1);
		this.renderChart(el, periods, index);
	}

	private colour(level: Level): string {
		const { settings } = this.plugin;
		return level === "known" ? settings.knownColor : level === "semiknown" ? settings.semiknownColor : settings.unknownColor;
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
			const bar = area.createDiv({ cls: "langsoft-progress-bar" });
			bar.style.height = `${(totalOf(period) / max) * 100}%`;
			// top to bottom: unknown, semi-known, known, so known words build up from the bottom
			for (const level of [...LEVEL_ORDER].reverse()) {
				if (period.totals[level] === 0) continue;
				const segment = bar.createDiv({ cls: "langsoft-progress-segment" });
				segment.style.flexGrow = String(period.totals[level]);
				segment.style.backgroundColor = this.colour(level);
			}
			column.createDiv({ cls: "langsoft-progress-label", text: period.label });
		}
	}

	async onClose() {
		// Nothing to clean up.
	}
}
