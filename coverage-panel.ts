import { EditorView, Panel, showPanel, ViewUpdate } from "@codemirror/view";
import type LangsoftPlugin from "main";
import { CoverageLevel, noteCoverage } from "coverage";
import { wasTriggered } from "highlighter";

const NAMES: Record<CoverageLevel, string> = {
	known: "known",
	semiknown: "semi-known",
	unknown: "unknown",
	coworker: "coworkers",
	none: "not looked up",
};
/** In the bar; the rest, "none", is left grey. */
const ORDER: CoverageLevel[] = ["known", "semiknown", "unknown", "coworker"];

/** A bar at the bottom of each note: how much of it you know. */
export function createCoveragePanel(plugin: LangsoftPlugin) {
	return showPanel.of((view: EditorView): Panel => {
		const dom = createDiv({ cls: "langsoft-coverage" });
		let timer: number | undefined;

		const colour = (level: CoverageLevel) =>
			level === "known"
				? plugin.settings.knownColor
				: level === "semiknown"
					? plugin.settings.semiknownColor
					: level === "unknown"
						? plugin.settings.unknownColor
						: level === "coworker"
							? plugin.settings.coworkerColor
							: "";

		const render = () => {
			dom.empty();
			const show = plugin.settings.showNoteCoverage && plugin.currentUser !== "";
			dom.toggle(show);
			if (!show) return;

			const coverage = noteCoverage(view.state.doc.toString(), plugin.dictManager.userDict, plugin.dictManager.otherDicts);
			if (coverage.words === 0) {
				dom.toggle(false);
				return;
			}
			const percent = (level: CoverageLevel) => Math.round((coverage.counts[level] / coverage.words) * 100);

			const bar = dom.createDiv({ cls: "langsoft-coverage-bar" });
			for (const level of ORDER) {
				if (coverage.counts[level] === 0) continue;
				const segment = bar.createDiv({ cls: `langsoft-coverage-segment langsoft-coverage-${level}` });
				segment.style.width = `${(coverage.counts[level] / coverage.words) * 100}%`;
				if (colour(level)) segment.style.backgroundColor = colour(level);
			}

			const text = dom.createDiv({ cls: "langsoft-coverage-text" });
			text.createSpan({ cls: "langsoft-coverage-words", text: `${coverage.words} words` });
			for (const level of ORDER) {
				text.createSpan({ text: `${NAMES[level]} ${percent(level)}%` });
			}
			dom.setAttribute(
				"aria-label",
				`${coverage.words} different words in this note: ` +
					[...ORDER, "none" as const].map((level) => `${coverage.counts[level]} ${NAMES[level]}`).join(", ")
			);
		};
		render();

		return {
			dom,
			top: false,
			update(update: ViewUpdate) {
				if (!update.docChanged && !wasTriggered(update)) return;
				window.clearTimeout(timer);
				// wait until typing pauses; dictionary changes and settings show straight away
				timer = window.setTimeout(render, update.docChanged ? 500 : 0);
			},
			destroy() {
				window.clearTimeout(timer);
			},
		};
	});
}
