import LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf, Setting, TextAreaComponent, TextComponent, CheckboxComponent, SliderComponent, ToggleComponent, ColorComponent, ButtonComponent, Menu, MenuItem, SearchComponent, Notice, MarkdownView } from "obsidian";
import { Definition, highlightHistoryEntry, WordEntry } from "dictionaries";


export const VIEW_TYPE_DEFINER = "definer-view";

export class DefinerView extends ItemView {
	plugin: LangsoftPlugin;
	selectetedText: TextAreaComponent;
	newDefinition: TextAreaComponent;
	listContainer: HTMLUListElement;
	unknownButton: ButtonComponent;
	semiknownButton: ButtonComponent;
	knownButton: ButtonComponent;
	selectionContext: string;
	coworkerDiv: HTMLDivElement;
	coworkerListContainer: HTMLUListElement;

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


		const container = this.containerEl.children[1];
		container.empty();

		container.createEl("h1", { text: "Langsoft 📖" });
		// const searchEl = container.createEl("h5", { text: "Word / Phrase: " });
		// const searchEl = container.createEl("h5", { text: "" });
		this.selectetedText = new TextAreaComponent(container);
		// this.searchTerm = new SearchComponent(searchEl);
		this.selectetedText.setPlaceholder("Select some text in main window");
		this.selectetedText.setDisabled(true);

		container.createEl("h1", { text: " " });

		this.unknownButton = new ButtonComponent(container);
		this.unknownButton.setIcon("plane-takeoff")
		this.unknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.unknownButton.buttonEl.style.color = "black";
		this.unknownButton.onClick(() => {
			if (this.getCurrentHighlightState() !== "unknown") {
				if (this.listContainer.getElementsByTagName("summary").length > 0) {
					// this.writeNewKnownLevelToDict("unknown")
					this.plugin.dictManager.writeHighlightChangeToJson(this.selectetedText.getValue(), "unknown")
				}
			}
			this.changeKnownLevelButtonColor("unknown");

		})

		this.semiknownButton = new ButtonComponent(container);
		this.semiknownButton.setIcon("plane")
		this.semiknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.semiknownButton.buttonEl.style.color = "black";
		this.semiknownButton.onClick(() => {
			if (this.getCurrentHighlightState() !== "semiknown") {
				if (this.listContainer.getElementsByTagName("summary").length > 0) {
					// this.writeNewKnownLevelToDict("semiknown")
					this.plugin.dictManager.writeHighlightChangeToJson(this.selectetedText.getValue(), "semiknown")
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
		this.knownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.knownButton.buttonEl.style.color = "black";
		this.knownButton.onClick(() => {
			if (this.getCurrentHighlightState() !== "known") {
				if (this.listContainer.getElementsByTagName("summary").length > 0) {
					// this.writeNewKnownLevelToDict("known")
					this.plugin.dictManager.writeHighlightChangeToJson(this.selectetedText.getValue(), "known")
				}
			}
			this.changeKnownLevelButtonColor("known");
		})

		container.createEl("h1", { text: "" }); // create some space

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
			const val = this.newDefinition.getValue().trim();
			if (val !== "") {
				const context = this.getCurrentContext();
				this.plugin.dictManager.addNewDefinition(this.selectetedText.getValue().trim().toLowerCase(), this.getCurrentHighlightState(), this.newDefinition.getValue().trim().toLowerCase(), context);
				this.plugin.dictManager.writeUserDictToJson();
				this.plugin.refreshHighlights();
				this.addListItem(this.newDefinition.getValue().trim().toLowerCase(), context)
				this.newDefinition.setValue("");
			}
		});
		this.containerEl.addEventListener("keyup", (event) => {
			// if (event.key === "Enter" && event.ctrlKey) {
			if (event.key === "Enter") {
				event.preventDefault();
				addButton.click();

				// Try to get the active Markdown view
				let mdView = this.app.workspace.getActiveViewOfType(MarkdownView);

				if (!mdView) {
					// No Markdown editor is active → find any leaf with MarkdownView
					const leaves = this.app.workspace.getLeavesOfType("markdown");
					if (leaves.length > 0) {
						const leaf = leaves[0];
						this.app.workspace.setActiveLeaf(leaf); // make it active
						mdView = leaf.view as MarkdownView;
					}
				}

				if (mdView) {
					mdView.editor.focus(); // focus the editor
				}





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
			this.plugin.dictManager.markDefinitionDeleted(this.selectetedText.getValue().toLowerCase(), definitionToDelete);
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
				if (item.children.item(0).textContent === defText) {
					seen = true
				}
			}
			if (!seen) {
				const context = this.getCurrentContext();
				// this.plugin.dictManager.addNewDefinition(defText.trim().toLowerCase(), this.getCurrentHighlightState(), this.newDefinition.getValue().trim().toLowerCase(), context);
				this.plugin.dictManager.addNewDefinition(this.selectetedText.getValue().trim().toLowerCase(), this.getCurrentHighlightState(), defText, context);
				this.plugin.dictManager.writeUserDictToJson();
				console.log("from here")
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

	createTable(context: string, file: string, date: string): HTMLTableElement {
		const table = document.createElement("table");
		table.createEl("tr");
		const contextRow = document.createElement("tr");
		const contextTitle = document.createElement("td");
		const contextContent = document.createElement("td");
		contextTitle.innerHTML = '<strong>Context: </strong>';
		contextContent.innerHTML = context;
		contextRow.appendChild(contextTitle);
		contextRow.appendChild(contextContent);
		const fileRow = document.createElement("tr");
		const fileTitle = document.createElement("td");
		const fileContent = document.createElement("td");
		fileTitle.innerHTML = '<strong>File: </strong>';
		fileContent.innerHTML = file;
		fileRow.appendChild(fileTitle);
		fileRow.appendChild(fileContent);
		const dateRow = document.createElement("tr");
		const dateTitle = document.createElement("td");
		const dateContent = document.createElement("td");
		dateTitle.innerHTML = '<strong>Date: </strong>';
		dateContent.innerHTML = date;
		dateRow.appendChild(dateTitle);
		dateRow.appendChild(dateContent);

		table.appendChild(contextRow);
		table.appendChild(fileRow);
		table.appendChild(dateRow);

		return table;
	}

	getCurrentHighlightState() {
		let currentHighlight = "none";
		if (this.unknownButton.buttonEl.style.backgroundColor !== "var(--interactive-normal)") {
			currentHighlight = "unknown";
		}
		if (this.semiknownButton.buttonEl.style.backgroundColor !== "var(--interactive-normal)") {
			currentHighlight = "semiknown";
		}
		if (this.knownButton.buttonEl.style.backgroundColor !== "var(--interactive-normal)") {
			currentHighlight = "known";
		}
		return currentHighlight;
	}

	// writeNewKnownLevelToDict() {
	// 	console.log("should save highlight change")
	// }

	changeKnownLevelButtonColor(selection: string) {
		const currentHighlight = this.getCurrentHighlightState();
		if (currentHighlight === selection) { // don't change it if it is the same
			return;
		}
		// if (this.listContainer.getElementsByTagName("summary").length > 0) {
		// find out if we need to write the change (only if there at least one definition)
		// only one can be selected at a time, so this clears out every highlighted button ready for the new color
		this.unknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.semiknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.knownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		if (selection === "unknown") {
			this.unknownButton.buttonEl.style.backgroundColor = this.plugin.settings.unknownColor;
		}
		if (selection === "semiknown") {
			this.semiknownButton.buttonEl.style.backgroundColor = this.plugin.settings.semiknownColor;
		}
		if (selection === "known") {
			this.knownButton.buttonEl.style.backgroundColor = this.plugin.settings.knownColor;
		}
		// }
	}

	handleSelection(selection: string, context: string) {
		this.selectetedText.setValue(selection);
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
		this.newDefinition.inputEl.focus();
	}






	async onClose() {
		// Nothing to clean up.
	}
}




