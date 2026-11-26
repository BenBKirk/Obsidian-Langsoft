import { StateEffect, StateField } from "@codemirror/state";
import { EditorView, Panel, showPanel } from "@codemirror/view";
import { setIcon } from "obsidian";
import type LangsoftPlugin from "main";
import { DefinerPanel } from "definer-panel";

/** Open (true) or close (false) the Definer panel at the bottom of an editor. */
export const setDefinerPanel = StateEffect.define<boolean>();

/**
 * The Definer at the bottom of the editor, used on phones instead of the
 * sidebar, which would cover the note. Each editor has its own.
 */
export function createDefinerBottomPanel(plugin: LangsoftPlugin) {
	const panels = new Map<EditorView, DefinerPanel>();

	const open = StateField.define<boolean>({
		create: () => false,
		update(value, tr) {
			for (const effect of tr.effects) {
				if (effect.is(setDefinerPanel)) value = effect.value;
			}
			return value;
		},
		provide: (field) => showPanel.from(field, (on) => (on ? createPanel : null)),
	});

	function createPanel(view: EditorView): Panel {
		const dom = createDiv({ cls: "langsoft-bottom-panel" });
		const header = dom.createDiv({ cls: "langsoft-bottom-panel-header" });
		header.createSpan({ cls: "langsoft-bottom-panel-title", text: "Langsoft" });
		const close = header.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Close" } });
		setIcon(close, "x");
		close.addEventListener("click", () => view.dispatch({ effects: setDefinerPanel.of(false) }));

		const definer = new DefinerPanel(dom.createDiv(), plugin, { compact: true });
		panels.set(view, definer);
		return {
			dom,
			top: false,
			destroy: () => {
				panels.delete(view);
			},
		};
	}

	return {
		extension: open,
		/** The Definer in this editor, opening the panel if needed. */
		openIn(view: EditorView): DefinerPanel | null {
			if (!panels.has(view)) view.dispatch({ effects: setDefinerPanel.of(true) });
			return panels.get(view) ?? null;
		},
		/** The Definer in this editor if its panel is open. */
		get(view: EditorView): DefinerPanel | null {
			return panels.get(view) ?? null;
		},
	};
}
