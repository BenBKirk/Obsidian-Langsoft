import { Editor, MarkdownView, Plugin, WorkspaceLeaf } from "obsidian";
import { EditorView, hoverTooltip, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { createHighlightPlugin, TriggerEffect, TriggerField } from "highlighter";
import { DEFAULT_SETTINGS, LangsoftPluginSettings, LangsoftSettingsTab } from "settings";
import { DictionaryManager } from "dictionaries";
import { VIEW_TYPE_DEFINER, DefinerView } from "definer";


export default class LangsoftPlugin extends Plugin {
	myViewPlugin: ViewPlugin;
	settings: LangsoftPluginSettings;
	settingsTab: LangsoftSettingsTab;
	dictManager: DictionaryManager;
	styleEl: Element;


	async onload() {
		await this.loadSettings()
		this.settingsTab = new LangsoftSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		this.myViewPlugin = createHighlightPlugin(this);
		this.registerEditorExtension(this.myViewPlugin);
		this.registerEditorExtension(TriggerField);

		this.dictManager = new DictionaryManager(this)
		this.styleEl = document.head.createEl("style");
		this.updateStyle()
		this.registerEditorExtension(this.wordHover);


		this.registerView(
			VIEW_TYPE_DEFINER,
			(leaf) => new DefinerView(leaf, this)
		);

		this.registerDomEvent(document.body, "mouseup", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const selectedText = view.editor.getSelection();
				let context = " ";
				if (selectedText !== "") {
					context = this.getContextForSelection(view.editor)
				} else {
					context = " ";
				}

				// const cursor = view.editor
				this.activateView();
				const leaf = this.getDefinerViewLeaf();
				leaf.handleSelection(selectedText.trim(), context);
			}
		}
		);
	}

	refreshHighlights() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view instanceof MarkdownView ? leaf.view : null;
			if (mdView) {
				const cm = (mdView.editor as any).cm as EditorView;
				cm.dispatch({ effects: TriggerEffect.of(null) });
			}
		}
	}


	getDefinerViewLeaf() {
		return this.app.workspace.getLeavesOfType(VIEW_TYPE_DEFINER)[0].view as DefinerView;

	}

	updateStyle() {
		this.styleEl.textContent = this.settingsToStyle()
	}

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

	settingsToStyle() {
		let style = "";

		const highlightTypes = ["unknown", "semiknown", "known"]
		const highlightTypesUnderline = ["unknownunderline", "semiknownunderline", "knownunderline"]
		const enabled = [this.settings.unknownEnabled, this.settings.semiknownEnabled, this.settings.knownEnabled]
		const colors = [this.settings.unknownColor, this.settings.semiknownColor, this.settings.knownColor]
		for (let i = 0; i < highlightTypes.length; i++) {
			if (enabled[i]) {
				style = style.concat(`.${highlightTypes[i]} { color: ${colors[i]};} \n`);
			}
		}
		for (let i = 0; i < highlightTypesUnderline.length; i++) {
			if (enabled[i]) {
				// style = style.concat(`.${highlightTypesUnderline[i]} {text-decoration: underline; text-decoration-color: ${this.hexToRGB(colors[i], 0.2)}; text-decoration-thickness: 3px;} \n`);
				style = style.concat(`.${highlightTypesUnderline[i]} { background-color: ${this.hexToRGB(colors[i], 0.2)}; } \n`);
				// style = style.concat(`.${highlightTypesUnderline[i]} {text-decoration: underline; text-decoration-color: ${this.hexToRGB(colors[i], 0.5)}; text-decoration-thickness: 5px;} \n`);
				// style = style.concat(`.${highlightTypesUnderline[i]} {display: inline-blocks; padding: 5px; border-bottom: 2px solid ${this.hexToRGB(colors[i], 0.2)}; border-left: 2px solid ${this.hexToRGB(colors[i], 0.2)}; border-right: 2px solid ${this.hexToRGB(colors[i], 0.2)};} \n`);
			}
		}
		return style;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.dictManager.init();
	}

	wordHover = hoverTooltip((view, pos, side) => {
		const { from, to, text } = view.state.doc.lineAt(pos);
		let start = pos,
			end = pos;

		// Expand selection to include the full word
		while (start > from && /\w/.test(text[start - from - 1])) start--;
		while (end < to && /\w/.test(text[end - from])) end++;

		if ((start == pos && side < 0) || (end == pos && side > 0)) return null;

		const word = text.slice(start - from, end - from).toLowerCase();

		const def = this.dictManager.userDict[word];
		if (!def) {
			return null;
		}
		const defs = def.definitions.map(def => def.definition)
		return {
			pos: start,
			end,
			above: true, // ✅ Force tooltip to appear ABOVE the word
			strictSide: true, // Prevents tooltip from flipping sides unexpectedly
			create(view) {
				const dom = document.createElement("div");
				dom.classList.add("tooltip");
				dom.textContent = defs.join(" / ");
				return { dom };
			},
		};
	});

	async activateView() {
		const { workspace } = this.app;

		const leaf = this.getDefinerViewLeaf()
		workspace.revealLeaf(leaf.leaf);
	}

	getContextForSelection(editor: Editor) {
		const lenContextWords = 7;
		const selection = editor.getSelection();
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const regex = /\s+/;
		const textBeforeSel = line.slice(0, cursor.ch - selection.length)
		const textAfterSel = line.slice(cursor.ch, line.length)
		let wordListBefore = textBeforeSel.split(regex);
		let wordListAfter = textAfterSel.split(regex);
		if (wordListBefore.length > lenContextWords) {
			wordListBefore = wordListBefore.reverse().slice(0, lenContextWords);
			wordListBefore[lenContextWords - 1] = "..." + wordListBefore[lenContextWords - 1];
			wordListBefore = wordListBefore.reverse();
		}
		if (wordListAfter.length > lenContextWords) {
			wordListAfter = wordListAfter.slice(0, lenContextWords);
			wordListAfter[lenContextWords - 1] = wordListAfter[lenContextWords - 1] + "...";
		}
		const wordsBefore = wordListBefore.join(" ")
		const wordsAfter = wordListAfter.join(" ")
		return `${wordsBefore} <u>${selection} </u>${wordsAfter}`
	}

	parseIntoWords(text: string, offset: number) {
		// const regex = /\b\w+\b/g;
		const regex = /[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu;
		const words: { text: string; from: number; to: number }[] = [];
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			if (match.index != null) {
				words.push({
					text: match[0],
					from: match.index + offset,
					to: match.index + offset + match[0].length,
				});
			}
		}
		return words;
	}




	onunload() {
		this.styleEl.remove();
	}

}


