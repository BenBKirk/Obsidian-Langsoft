import type LangsoftPlugin from "main";
import { App, ButtonComponent, MarkdownView, moment, Platform, TextAreaComponent } from "obsidian";
import { Definition } from "dictionaries";
import { splitContext } from "words";

/**
 * The Definer: the selected word, its level, your definitions and your
 * coworkers'. Drawn into any container, so it can live in the sidebar or
 * in a panel at the bottom of the editor.
 */
export class DefinerPanel {
	plugin: LangsoftPlugin;
	app: App;
	selectedTextComponent: TextAreaComponent;
	newDefinition: TextAreaComponent;
	listContainer: HTMLUListElement;
	unknownButton: ButtonComponent;
	semiknownButton: ButtonComponent;
	knownButton: ButtonComponent;
	selectionContext: string;
	coworkerDiv: HTMLDivElement;
	coworkerListContainer: HTMLUListElement;
	/** The selected level: "unknown", "semiknown", "known", or "none" before a word is chosen. */
	private level = "none";

	/** In compact mode (the phone panel), the big title and spacing are left out. */
	private compact: boolean;

	constructor(container: HTMLElement, plugin: LangsoftPlugin, options: { compact?: boolean } = {}) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.compact = options.compact ?? false;
		this.render(container);
	}

	/** Build the Definer inside `container`. */
	private render(container: HTMLElement) {
		container.empty();
		container.addClass("langsoft-definer");

		if (!this.compact) container.createEl("h1", { text: "Langsoft 📖" });
		this.selectedTextComponent = new TextAreaComponent(container);
		this.selectedTextComponent.setPlaceholder(
			Platform.isMobile ? "Long-press a word in your note" : "Select some text in main window"
		);
		this.selectedTextComponent.setDisabled(true);

		if (!this.compact) container.createEl("h1", { text: " " });

		this.unknownButton = new ButtonComponent(container);
		this.unknownButton.setIcon("plane-takeoff")
		this.unknownButton.buttonEl.addClass("langsoft-level-button");
		this.unknownButton.onClick(() => {
			if (this.getCurrentHighlightState() !== "unknown") {
				if (this.listContainer.getElementsByTagName("summary").length > 0) {
					// this.writeNewKnownLevelToDict("unknown")
					this.plugin.dictManager.writeHighlightChangeToJson(this.selectedTextComponent.getValue(), "unknown")
				}
			}
			this.changeKnownLevelButtonColor("unknown");

		})

		this.semiknownButton = new ButtonComponent(container);
		this.semiknownButton.setIcon("plane")
		this.semiknownButton.buttonEl.addClass("langsoft-level-button");
		this.semiknownButton.onClick(() => {
			if (this.getCurrentHighlightState() !== "semiknown") {
				if (this.listContainer.getElementsByTagName("summary").length > 0) {
					// this.writeNewKnownLevelToDict("semiknown")
					this.plugin.dictManager.writeHighlightChangeToJson(this.selectedTextComponent.getValue(), "semiknown")
				}
			}
			this.changeKnownLevelButtonColor("semiknown");
		})

		this.knownButton = new ButtonComponent(container);
		// knownButton.setButtonText("known");
		this.knownButton.setIcon("rocket")
		// knownButton.setIcon("sparles")
		// knownButton.setIcon("battery-full")
		// this.knownButton.setClass("knownButton")
		this.knownButton.buttonEl.addClass("langsoft-level-button");
		this.knownButton.onClick(() => {
			if (this.getCurrentHighlightState() !== "known") {
				if (this.listContainer.getElementsByTagName("summary").length > 0) {
					// this.writeNewKnownLevelToDict("known")
					this.plugin.dictManager.writeHighlightChangeToJson(this.selectedTextComponent.getValue(), "known")
				}
			}
			this.changeKnownLevelButtonColor("known");
		})

		if (!this.compact) container.createEl("h1", { text: "" }); // create some space

		const userDictEl = container.createEl("div", { text: "My Definitions: " });

		// Create the list container
		this.listContainer = userDictEl.createEl("ul", { cls: "my-dynamic-list" });

		const newMeaningEl = container.createEl("div", { text: " " });

		this.newDefinition = new TextAreaComponent(newMeaningEl);
		this.newDefinition.setPlaceholder("New definition");
		// this.wordDefinition.setValue("blank")
		newMeaningEl.createEl("br", { text: " " });

		// Example: Adding a button to add new items dynamically
		const addButton = newMeaningEl.createEl("button", { text: "Add Definition" });
		addButton.addEventListener("click", () => {
			const newDefVal = this.newDefinition.getValue().trim();
			const selVal = this.selectedTextComponent.getValue().trim();
			// const val = this.newDefinition.getValue().trim();
			if (newDefVal !== "" && selVal !== "") {
				const context = this.getCurrentContext();
				this.plugin.dictManager.addNewDefinition(this.selectedTextComponent.getValue().trim().toLowerCase(), this.getCurrentHighlightState(), this.newDefinition.getValue().trim().toLowerCase(), context);
				this.plugin.dictManager.writeUserDictToJson();
				this.plugin.refreshHighlights();
				this.addListItem(this.newDefinition.getValue().trim().toLowerCase(), context)
				this.newDefinition.setValue("");
				// on phones and tablets, focusing the note would open the on-screen keyboard over it
				if (Platform.isMobile) return;
				// Try to get the active Markdown view
				let mdView = this.app.workspace.getActiveViewOfType(MarkdownView);

				if (!mdView) {
					// No Markdown editor is active → find any leaf with MarkdownView
					const leaves = this.app.workspace.getLeavesOfType("markdown");
					if (leaves.length > 0) {
						const leaf = leaves[this.plugin.lastTabIndex];
						this.app.workspace.setActiveLeaf(leaf); // make it active
						mdView = leaf.view as MarkdownView;
					}
				}

				if (mdView) {
					mdView.editor.focus(); // focus the editor
				}
			}
		});
		this.newDefinition.inputEl.addEventListener("keydown", (event) => {
			// not while an input method or predictive keyboard is still composing text
			if (event.key === "Enter" && !event.isComposing) {
				event.preventDefault();
				addButton.click();
			}
		});


		this.coworkerDiv = container.createEl("div", { text: "" });
		this.coworkerDiv.hide();
		this.coworkerDiv.createEl("hr") //divider
		this.coworkerDiv.createEl("div", { text: "Co-Workers Definitions: " });
		this.coworkerListContainer = this.coworkerDiv.createEl("ul", { cls: "my-dynamic-list" });
	}



	getCurrentContext(): Definition {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const activeFile = this.app.workspace.getActiveFile();
		return {
			deleted: false,
			timestamp: timestamp,
			file: activeFile?.name, sentence: this.selectionContext
		};
	}

	addListItem(text: string, context: Definition) {
		const details = this.listContainer.createEl("details");
		const summary = this.listContainer.createEl("summary");
		summary.textContent = text;
		details.appendChild(summary);
		const table = this.createTable(context.sentence, context.file, context.timestamp);
		details.appendChild(table);
		const removeButton = details.createEl("a", { text: "Delete" });
		removeButton.addEventListener("click", () => {
			details.remove();
			const definitionToDelete = details.find("summary").getText();
			this.plugin.dictManager.markDefinitionDeleted(this.selectedTextComponent.getValue().toLowerCase(), definitionToDelete);
			// this.handleSelection(text, context);
		});
	}

	// addCoworkerTitleItem(dict: string) {
	// const name = this.coworkerListContainer.createEl('h2', { text: dict });
	// }

	addCoworkerListItem(defText: string, context: Definition) {
		const details = this.coworkerListContainer.createEl("details");
		const summary = this.coworkerListContainer.createEl("summary");
		const copyDefButton = this.coworkerListContainer.createEl("button", { text: defText });
		copyDefButton.addEventListener("click", () => {
			// const test = new Notice(copyDefButton.parentElement?.firstChild?.textContent?.trim());
			// check if definiton is unique or if the same one already exists
			let seen = false;
			for (const item of this.listContainer.children) {
				if (item.children.item(0)?.textContent === defText) {
					seen = true
				}
			}
			if (!seen) {
				const context = this.getCurrentContext();
				// this.plugin.dictManager.addNewDefinition(defText.trim().toLowerCase(), this.getCurrentHighlightState(), this.newDefinition.getValue().trim().toLowerCase(), context);
				this.plugin.dictManager.addNewDefinition(this.selectedTextComponent.getValue().trim().toLowerCase(), this.getCurrentHighlightState(), defText, context);
				this.plugin.dictManager.writeUserDictToJson();
				this.plugin.refreshHighlights();
				// this.newDefinition.setValue("");
				// this.addListItem(defText, context);
				this.addListItem(defText, context)


			}

		})
		details.appendChild(summary);
		summary.appendChild(copyDefButton);
		const table = this.createTable(context.sentence, context.file, context.timestamp);
		details.appendChild(table);
	}

	/**
	 * Context, file and date of a definition. Everything is inserted as text,
	 * never as HTML, because these values can come from other people's
	 * dictionaries.
	 */
	createTable(context: string | undefined, file: string | undefined, date: string | undefined): HTMLTableElement {
		const table = createEl("table");
		const addRow = (title: string) => {
			const row = table.createEl("tr");
			row.createEl("td").createEl("strong", { text: `${title}: ` });
			return row.createEl("td");
		};

		const contextCell = addRow("Context");
		const parts = splitContext(String(context ?? ""));
		if (parts) {
			contextCell.appendText(parts.before);
			contextCell.createEl("u", { text: parts.selection });
			contextCell.appendText(parts.after);
		} else {
			contextCell.setText(String(context ?? ""));
		}
		const fileCell = addRow("File");
		fileCell.setText(String(file ?? ""));
		if (file) {
			const go = fileCell.createEl("a", { cls: "langsoft-go-to-sentence", text: "Go to sentence" });
			go.addEventListener("click", (event) => {
				event.preventDefault();
				this.plugin.goToDefinitionContext({ file, sentence: String(context ?? "") });
			});
		}
		addRow("Date").setText(String(date ?? ""));
		return table;
	}

	getCurrentHighlightState() {
		return this.level;
	}

	/** Show `selection` as the chosen level ("unknown", "semiknown" or "known"); anything else clears it. */
	changeKnownLevelButtonColor(selection: string) {
		const buttons: Record<string, ButtonComponent> = {
			unknown: this.unknownButton,
			semiknown: this.semiknownButton,
			known: this.knownButton,
		};
		const colours: Record<string, string> = {
			unknown: this.plugin.settings.unknownColor,
			semiknown: this.plugin.settings.semiknownColor,
			known: this.plugin.settings.knownColor,
		};
		this.level = selection in buttons ? selection : "none";
		for (const [level, button] of Object.entries(buttons)) {
			const active = level === this.level;
			button.buttonEl.toggleClass("is-active", active);
			button.buttonEl.style.backgroundColor = active ? colours[level] : "";
		}
	}

		getFocus() {
		this.newDefinition.inputEl.focus();
	}



	handleSelection(selection: string, context: string) {
		this.selectedTextComponent.setValue(selection);
		this.selectionContext = context;
		this.listContainer.empty();
		this.coworkerDiv.hide()
		this.coworkerListContainer.empty();
		if (selection === "") {
			this.changeKnownLevelButtonColor("None");
		} else {
			const result = this.plugin.dictManager.userDict[selection.toLowerCase()];
			for (const [name, dict] of Object.entries(this.plugin.dictManager.otherDicts)) {
				const coworkerResult = dict[selection.toLowerCase()];
				if (coworkerResult && coworkerResult.highlight != "None") {
					this.coworkerListContainer.createEl('div', { text: name });
					for (const [key, val] of Object.entries(coworkerResult.definitions)) {
						if (!val.deleted) {
							this.addCoworkerListItem(key, val);

						}
					}
					this.coworkerDiv.show();

				}
			}
			if (result && result.highlight != "None") {
				this.changeKnownLevelButtonColor(result.highlight);
				for (const [key, val] of Object.entries(result.definitions)) {
					if (!val.deleted) {
						this.addListItem(key, val);
					}
				}

			} else {
				this.changeKnownLevelButtonColor("unknown");
				// test code:
			}
		}
	}
}
