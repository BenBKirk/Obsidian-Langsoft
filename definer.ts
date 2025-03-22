import LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf, Setting, TextAreaComponent, TextComponent, CheckboxComponent, SliderComponent, ToggleComponent, ColorComponent, ButtonComponent, Menu, MenuItem, SearchComponent } from "obsidian";
import { Context } from "dictionaries";

export const VIEW_TYPE_DEFINER = "definer-view";

export class DefinerView extends ItemView {
	plugin: LangsoftPlugin;
	searchTerm: TextAreaComponent;
	wordDefinition: TextAreaComponent;
	listContainer: HTMLUListElement;
	knownLevelSelected: string;
	unknownButton: ButtonComponent;
	semiknownButton: ButtonComponent;
	knownButton: ButtonComponent;

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

		this.knownLevelSelected = "none";

		const container = this.containerEl.children[1];
		container.empty();

		container.createEl("h1", { text: "Langsoft 📖" });
		// const searchEl = container.createEl("h5", { text: "Word / Phrase: " });
		// const searchEl = container.createEl("h5", { text: "" });
		this.searchTerm = new TextAreaComponent(container);
		// this.searchTerm = new SearchComponent(searchEl);
		this.searchTerm.setPlaceholder("Select some text in main window");
		this.searchTerm.setDisabled(true);

		container.createEl("h1", { text: " " });

		this.unknownButton = new ButtonComponent(container);
		this.unknownButton.setIcon("plane-takeoff")
		this.unknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.unknownButton.buttonEl.style.color = "black";
		this.unknownButton.onClick(() => {
			this.knownLevelSelected = "unknown";
			this.handleLevelChange("unknown")
		})

		this.semiknownButton = new ButtonComponent(container);
		this.semiknownButton.setIcon("plane")
		this.semiknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.semiknownButton.buttonEl.style.color = "black";
		this.semiknownButton.onClick(() => {
			this.knownLevelSelected = "semiknown";
			this.handleLevelChange("semiknown")
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
			this.knownLevelSelected = "known";
			this.handleLevelChange("known")
		})

		container.createEl("h1", { text: "" });

		const userDictEl = container.createEl("div", { text: "My Definitions: " });

		// Create the list container
		this.listContainer = userDictEl.createEl("ul", { cls: "my-dynamic-list" });

		const newMeaningEl = container.createEl("div", { text: " " });

		this.wordDefinition = new TextAreaComponent(newMeaningEl);
		this.wordDefinition.setPlaceholder("New definition");
		// this.wordDefinition.setValue("blank")
		newMeaningEl.createEl("br", { text: " " });

		// Example: Adding a button to add new items dynamically
		const addButton = newMeaningEl.createEl("button", { text: "Add Definition" });
		addButton.addEventListener("click", () => {
			const val = this.wordDefinition.getValue();
			if (val !== "") {
				this.addListItem(val, { file: "whatever.md", context: "surrounding text", date: "2020-02-20" });
				this.wordDefinition.setValue("");
			}
		});


	}

	addListItem(text: string, context: Context) {
		const details = this.listContainer.createEl("details");
		const summary = this.listContainer.createEl("summary");
		summary.textContent = text;
		details.appendChild(summary);
		const table = this.createTable(context.sentence, context.file, context.timeStamp);
		details.appendChild(table);
		const removeButton = details.createEl("a", { text: "Delete" });
		removeButton.addEventListener("click", () => {
			details.remove();
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

	styleButtons(state: string) {
		if (state === "unknown") {
			this.unknownButton.setClass(`background-color: ${this.plugin.settings.unknownColor};\n color: black;`);
			this.semiknownButton.setClass(`background-color: var(--interactive-normal);\n color: black;`);
			this.knownButton.setClass(`background-color: var(--interactive-normal);\n color: black;`);
		}
		if (state === "semiknown") {
			this.unknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
			this.unknownButton.buttonEl.style.color = "black";

			this.unknownButton.setClass(`background-color: var(--interactive-normal);\n color: black;`);
			this.semiknownButton.setClass(`background-color: ${this.plugin.settings.semiknownColor};\n color: black;`);
			this.knownButton.setClass(`background-color: var(--interactive-normal);\n color: black;`);

		}
		if (state === "known") {
			this.unknownButton.setClass(`background-color: var(--interactive-normal);\n color: black;`);
			this.semiknownButton.setClass(`background-color: var(--interactive-normal);\n color: black;`);
			this.knownButton.setClass(`background-color: ${this.plugin.settings.knownColor};\n color: black; `);

		}
	}

	handleLevelChange(levelSelected: string) {
		this.unknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.semiknownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		this.knownButton.buttonEl.style.backgroundColor = "var(--interactive-normal)";
		if (levelSelected === "unknown") {
			this.unknownButton.buttonEl.style.backgroundColor = this.plugin.settings.unknownColor;
		}
		if (levelSelected === "semiknown") {
			this.semiknownButton.buttonEl.style.backgroundColor = this.plugin.settings.semiknownColor;
		}
		if (levelSelected === "known") {
			this.knownButton.buttonEl.style.backgroundColor = this.plugin.settings.knownColor;
		}



	}

	async onClose() {
		// Nothing to clean up.
	}
}




