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
		this.style.textContent = `

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

		// ".slider { --slider-thumb-border-color: green; --slider-thumb-border-width: 2; }"    // container.setAttribute("style",`input.slider { --slider-thumb-border-color: green; }`)


		const unknownButton = new ButtonComponent(container);
		// unknownButton.setButtonText("unknown");
		unknownButton.setIcon("thumbs-down")
		unknownButton.setClass("unknownButton")
		unknownButton.onClick(() => {
			this.style.textContent = `

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
		})

		const semiknownButton = new ButtonComponent(container);
		// semiknownButton.setButtonText("semi-known");
		semiknownButton.setIcon("grab")
		semiknownButton.setClass("semiknownButton")
		semiknownButton.onClick(() => {
			this.style.textContent = `

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
      }
      
      `;
		})

		const knownButton = new ButtonComponent(container);
		// knownButton.setButtonText("known");
		knownButton.setIcon("thumbs-up")
		knownButton.setClass("knownButton")
		knownButton.onClick(() => {
			this.style.textContent = `
      Button.unknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.semiknownButton {
        background-color: var(--interactive-normal);
        color: black;
      }
      Button.knownButton {
        background-color: ${this.plugin.settings.knownColor};
        color: black;
      }
        
      `
		})




		// const unknownColor = new ColorComponent(container)
		// // this.unknownColor = new ColorComponent(container);
		// unknownColor.setDisabled(true);
		// unknownColor.setValue(this.plugin.settings.unknownColor)
		// container.createEl("b", {text: " "})
		// this.unknown = new ToggleComponent(container);
		// this.unknown.onChange((value) => {
		//   if (value){
		//   this.semiknown.setValue(false);
		//   this.known.setValue(false);
		//   this.unknown.setDisabled(true);
		//   this.semiknown.setDisabled(false);
		//   this.known.setDisabled(false);
		//   }
		// });

		container.createEl("h1", { text: " " })

		// const semiKnownColor = new ColorComponent(container);
		// semiKnownColor.setDisabled(true);
		// semiKnownColor.setValue(this.plugin.settings.semiknownColor)
		// container.createEl("b", {text: " "})
		// this.semiknown = new ToggleComponent(container);
		// this.semiknown.onChange((value) => {
		//   if (value){
		//   this.unknown.setValue(false);
		//   this.known.setValue(false);
		//   this.unknown.setDisabled(false);
		//   this.semiknown.setDisabled(true);
		//   this.known.setDisabled(false);
		//   }
		// });

		container.createEl("h1", { text: " " })

		// const knownColor = new ColorComponent(container);
		// knownColor.setDisabled(true);
		// knownColor.setValue(this.plugin.settings.knownColor)
		// container.createEl("b", {text: " "})
		// this.known = new ToggleComponent(container);
		// this.known.onChange((value) => {
		//   if (value){
		//   this.unknown.setValue(false);
		//   this.semiknown.setValue(false);
		//   this.unknown.setDisabled(false);
		//   this.semiknown.setDisabled(false);
		//   this.known.setDisabled(true);
		//   }
		// });

		container.createEl("h2", { text: " " })
		const submitButton = new ButtonComponent(container);
		submitButton.setButtonText("Submit");
		submitButton.onClick(() => {
			// submitButton.setDisabled(true);
			const timestamp = Date.now();
			const date = new Date(timestamp);
		})









	}


	async onClose() {
		// Nothing to clean up.
	}
}


