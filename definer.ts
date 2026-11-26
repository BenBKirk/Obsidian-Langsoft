import type LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { DefinerPanel } from "definer-panel";


export const VIEW_TYPE_DEFINER = "definer-view";

/** The Definer in the right sidebar. */
export class DefinerView extends ItemView {
	plugin: LangsoftPlugin;
	panel: DefinerPanel;

	constructor(leaf: WorkspaceLeaf, plugin: LangsoftPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_DEFINER;
	}

	getDisplayText() {
		return "Definer view";
	}

	getIcon(): string {
		return "book";
	}

	async onOpen() {
		this.panel = new DefinerPanel(this.containerEl.children[1] as HTMLElement, this.plugin);
	}

	handleSelection(selection: string, context: string) {
		this.panel.handleSelection(selection, context);
	}

	getFocus() {
		this.panel.getFocus();
	}

	async onClose() {
		// Nothing to clean up.
	}
}
