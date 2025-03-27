import LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf, Setting, TextAreaComponent, TextComponent, CheckboxComponent, SliderComponent, ToggleComponent, ColorComponent, ButtonComponent, Menu, MenuItem, SearchComponent } from "obsidian";
import { Context, Entry } from "dictionaries";


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

		container.createEl("h1", { text: "" });

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
			const val = this.newDefinition.getValue();
			if (val !== "") {
				const context = this.getFirstContext();
				// this.addListItem(val, { file: "whatever.md", context: "surrounding text", date: "2020-02-20" });
				this.addListItem(val, context);
				this.newDefinition.setValue("");
				this.plugin.dictManager.writeNewDefinitionToJson(this.selectetedText.getValue(), this.getCurrentHighlightState(), { definition: val, deleted: false, firstcontext: context });
			}
		});


	}



	getFirstContext(): Context {
		const timestamp = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
		const sent = this.selectionContext;
		return { timestamp: timestamp, file: "test.md", sentence: this.selectionContext };
	}

	addListItem(text: string, context: Context) {
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
			this.plugin.dictManager.markDefinitionDeleted(this.selectetedText.getValue(), definitionToDelete);
		});
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
		console.log("currenthigh...", currentHighlight)
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
		if (selection === "") {
			this.changeKnownLevelButtonColor("none");
		} else {
			this.plugin.dictManager.searchUserDict(selection).then((entry) => {
				if (entry) {
					if (entry.deleted) {
						// this.selectetedText.setValue("")
						this.changeKnownLevelButtonColor("unknown");
						return;
					}
					const highlightLevel = this.plugin.dictManager.findMostRecentHighlightLevel(entry);
					this.changeKnownLevelButtonColor(highlightLevel);
					for (const def of entry.definitions) {
						if (def.deleted) {
							continue;
						}
						this.addListItem(def.definition, def.firstcontext)
					}
				} else {
					this.changeKnownLevelButtonColor("unknown");
				}
			});
		}
	}





	async onClose() {
		// Nothing to clean up.
	}
}




