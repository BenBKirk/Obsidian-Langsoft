import LangsoftPlugin from "main";
import { ItemView, WorkspaceLeaf, Setting ,TextAreaComponent, TextComponent, CheckboxComponent, SliderComponent, ToggleComponent, ColorComponent, ButtonComponent } from "obsidian";

export const VIEW_TYPE_DEFINER = "example-view";

export class DefinerView extends ItemView {
  plugin: LangsoftPlugin;
  searchTerm: TextComponent;
  wordDefinition: TextAreaComponent;
  // progressTrackerState:Int;
  unknownColor:ColorComponent;
  unknown: ToggleComponent;
  semiknown: ToggleComponent;
  known: ToggleComponent;




  constructor(leaf: WorkspaceLeaf, plugin: LangsoftPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_DEFINER;
  }

  getDisplayText() {
    return "Example view";
  }

  getIcon(): string {
  return "dice";
  }



  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    // container.createEl("h4", { text: "Example view" });
    container.createEl("h1", { text: "Langsoft 📖"});
    const searchEl = container.createEl("h5", { text: "Term: "});
    this.searchTerm = new TextComponent(searchEl);
    this.searchTerm.setPlaceholder("Select some text in main window");
    this.searchTerm.setDisabled(true);

    const defEl = container.createEl("h5", { text: "Definition: "});
    this.wordDefinition = new TextAreaComponent(defEl);
    this.wordDefinition.setPlaceholder("Enter a definition");
    // this.wordDefinition.setValue("hahaha")

    container.createEl("h5",{text:"Progress Tracker: "});
    const unknownColor = new ColorComponent(container)
    // this.unknownColor = new ColorComponent(container);
    unknownColor.setDisabled(true);
    unknownColor.setValue(this.plugin.settings.unknownColor)
    container.createEl("b", {text: " "})
    this.unknown = new ToggleComponent(container);
    this.unknown.onChange((value) => {
      if (value){
      this.semiknown.setValue(false);
      this.known.setValue(false);
      this.unknown.setDisabled(true);
      this.semiknown.setDisabled(false);
      this.known.setDisabled(false);
      }
    });

    container.createEl("h1", {text: " "})

    const semiKnownColor = new ColorComponent(container);
    semiKnownColor.setDisabled(true);
    semiKnownColor.setValue(this.plugin.settings.semiKnownColor)
    container.createEl("b", {text: " "})
    this.semiknown = new ToggleComponent(container);
    this.semiknown.onChange((value) => {
      if (value){
      this.unknown.setValue(false);
      this.known.setValue(false);
      this.unknown.setDisabled(false);
      this.semiknown.setDisabled(true);
      this.known.setDisabled(false);
      }
    });

    container.createEl("h1", {text: " "})

    const knownColor = new ColorComponent(container);
    knownColor.setDisabled(true);
    knownColor.setValue(this.plugin.settings.knownColor)
    container.createEl("b", {text: " "})
    this.known = new ToggleComponent(container);
    this.known.onChange((value) => {
      if (value){
      this.unknown.setValue(false);
      this.semiknown.setValue(false);
      this.unknown.setDisabled(false);
      this.semiknown.setDisabled(false);
      this.known.setDisabled(true);
      }
    });

    container.createEl("h2",{text: " "})
    const submitButton = new ButtonComponent(container);
    submitButton.setButtonText("Submit");
    submitButton.onClick(()=>{
      // submitButton.setDisabled(true);
			const timestamp = Date.now();
			const date = new Date(timestamp);
    })




  }


  async onClose() {
    // Nothing to clean up.
  }
}


