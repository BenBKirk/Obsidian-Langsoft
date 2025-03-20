import LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf, Setting, TextAreaComponent, TextComponent, CheckboxComponent, SliderComponent, ToggleComponent, ColorComponent, ButtonComponent, Menu, MenuItem } from "obsidian";

export const VIEW_TYPE_DEFINER = "definer-view";

export class DefinerView extends ItemView {
	plugin: LangsoftPlugin;
	searchTerm: TextComponent;
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

		const container = this.containerEl.children[1];
		container.empty();

		container.createEl("h1", { text: "Langsoft 📖" });
		const searchEl = container.createEl("h5", { text: "Term: " });
		this.searchTerm = new TextComponent(searchEl);
		this.searchTerm.setPlaceholder("Select some text in main window");
		this.searchTerm.setDisabled(true);

		const defEl = container.createEl("h5", { text: "Definition: " });
		this.wordDefinition = new TextAreaComponent(defEl);
		this.wordDefinition.setPlaceholder("Enter a definition");
		// this.wordDefinition.setValue("hahaha")

		const proEl = container.createEl("h5", { text: "Progress Tracker: " });

		this.style = container.createEl("style")
		this.style.textContent = this.noSelectionStyle;

		// ".slider { --slider-thumb-border-color: green; --slider-thumb-border-width: 2; }"    // container.setAttribute("style",`input.slider { --slider - thumb - border - color: green; } `)


		const unknownButton = new ButtonComponent(container);
		// unknownButton.setButtonText("unknown");
		unknownButton.setIcon("thumbs-down")
		unknownButton.setClass("unknownButton")
		unknownButton.onClick(() => {
			this.style.textContent = this.unknownSelectionStyle;
		})

		const semiknownButton = new ButtonComponent(container);
		// semiknownButton.setButtonText("semi-known");
		semiknownButton.setIcon("grab")
		semiknownButton.setClass("semiknownButton")
		semiknownButton.onClick(() => {
			this.style.textContent = this.semiknownSelectionStyle
		})

		const knownButton = new ButtonComponent(container);
		// knownButton.setButtonText("known");
		knownButton.setIcon("thumbs-up")
		knownButton.setClass("knownButton")
		knownButton.onClick(() => {
			this.style.textContent = this.knownSelectionStyle
		})


		container.createEl("h1", { text: " " })


		container.createEl("h1", { text: " " })


		container.createEl("h2", { text: " " })
		const submitButton = new ButtonComponent(container);
		submitButton.setButtonText("Submit");
		submitButton.onClick(() => {
			// submitButton.setDisabled(true);
			const timestamp = Date.now();
			const date = new Date(timestamp);
		})



		// Create the list container
		this.listContainer = container.createEl("ul", { cls: "my-dynamic-list" });

		// Add an example item
		this.addListItem("Item 1");
		this.addListItem("Item 2");

		// Example: Adding a button to add new items dynamically
		const addButton = container.createEl("button", { text: "Add Item" });
		addButton.addEventListener("click", () => {
			this.addListItem(`Item ${this.listContainer.children.length + 1} `);
		});


	}

	private addListItem(text: string) {
		const listItem = this.listContainer.createEl("li");
		listItem.textContent = text;

		// Add remove functionality
		const removeButton = listItem.createEl("button", { text: "Remove" });
		removeButton.addEventListener("click", () => {
			listItem.remove();
		});
	}

	async onClose() {
		// Nothing to clean up.
	}
}




