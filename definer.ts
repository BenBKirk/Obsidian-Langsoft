import LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf, Setting, TextAreaComponent, TextComponent, CheckboxComponent, SliderComponent, ToggleComponent, ColorComponent, ButtonComponent, Menu, MenuItem, SearchComponent } from "obsidian";

export const VIEW_TYPE_DEFINER = "definer-view";

export class DefinerView extends ItemView {
	plugin: LangsoftPlugin;
	searchTerm: TextAreaComponent;
	wordDefinition: TextAreaComponent;
	progressTracker: SliderComponent;
	unknownColor: ColorComponent;
	unknown: ToggleComponent;
	semiknown: ToggleComponent;
	known: ToggleComponent;
	style: Element;
	listContainer: HTMLUListElement;
	noSelectionStyle: string;
	unknownSelectionStyle: string;
	semiknownSelectionStyle: string;
	knownSelectionStyle: string;
	knownLevelSelected: string;

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

		this.noSelectionStyle = `
      Button.unknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.semiknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.knownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      `;

		this.unknownSelectionStyle = `
      Button.unknownButton {
        background-color: ${this.plugin.settings.unknownColor};
        color: black;
      }
      Button.semiknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.knownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      `;
		this.semiknownSelectionStyle = `
      Button.unknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.semiknownButton {
        background-color: ${this.plugin.settings.semiknownColor};
        color: black;
      }
      Button.knownButton {
        background-color: var(--interactive-normal);
        color: black;
      }`;

		this.knownSelectionStyle = `
      Button.unknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.semiknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.knownButton {
        background-color: var(--interactive-normal);
        background-color: ${this.plugin.settings.knownColor};
        color: black;
      }`;

		// const separator = document.createElement("h1", { text: " " });


		const container = this.containerEl.children[1];
		container.empty();

		container.createEl("h1", { text: "Langsoft 📖" });
		// const searchEl = container.createEl("h5", { text: "Word / Phrase: " });
		// const searchEl = container.createEl("h5", { text: "" });
		this.searchTerm = new TextAreaComponent(container);
		// this.searchTerm = new SearchComponent(searchEl);
		this.searchTerm.setPlaceholder("Select some text in main window");
		this.searchTerm.setDisabled(true);

		// const proEl = container.createEl("h5", { text: "Progress Tracker: " });
		// container.append(separator);
		container.createEl("h1", { text: " " });

		this.style = container.createEl("style")
		this.style.textContent = this.noSelectionStyle;

		// ".slider { --slider-thumb-border-color: green; --slider-thumb-border-width: 2; }"    // container.setAttribute("style",`input.slider { --slider - thumb - border - color: green; } `)


		const unknownButton = new ButtonComponent(container);
		// unknownButton.setButtonText("unknown");
		// unknownButton.setIcon("star-half")
		// unknownButton.setIcon("battery-low")
		// unknownButton.setIcon("wrench")
		// unknownButton.setIcon("traffic-cone")
		unknownButton.setIcon("plane-takeoff")
		unknownButton.setClass("unknownButton")
		unknownButton.onClick(() => {
			this.style.textContent = this.unknownSelectionStyle;
		})

		const semiknownButton = new ButtonComponent(container);
		// semiknownButton.setButtonText("semi-known");
		// semiknownButton.setIcon("star")
		// semiknownButton.setIcon("battery-medium")
		semiknownButton.setIcon("plane")
		semiknownButton.setClass("semiknownButton")
		semiknownButton.onClick(() => {
			this.style.textContent = this.semiknownSelectionStyle
		})

		const knownButton = new ButtonComponent(container);
		// knownButton.setButtonText("known");
		knownButton.setIcon("rocket")
		// knownButton.setIcon("sparles")
		// knownButton.setIcon("battery-full")
		knownButton.setClass("knownButton")
		knownButton.onClick(() => {
			this.style.textContent = this.knownSelectionStyle
		})

		container.createEl("h1", { text: "" });

		const userDictEl = container.createEl("div", { text: "My Definitions: " });

		// Create the list container
		this.listContainer = userDictEl.createEl("ul", { cls: "my-dynamic-list" });

		// Add an example item
		this.addListItem("Item 1");
		this.addListItem("Item 2");

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
				this.addListItem(val);
				this.wordDefinition.setValue("");
			}
		});


	}

	private addListItem(text: string) {
		const details = this.listContainer.createEl("details");
		const summary = this.listContainer.createEl("summary");
		summary.textContent = text;
		details.appendChild(summary);
		const table = this.createTable("because <u>Ben</u> decided to go", "test.md", "2025-03-20");
		details.appendChild(table);
		const removeButton = details.createEl("a", { text: "Delete", class: "--color-red" });
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

	async onClose() {
		// Nothing to clean up.
	}
}




