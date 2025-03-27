import { App, PluginSettingTab, Setting, debounce, TextAreaComponent, TextComponent, DropdownComponent } from 'obsidian';
import LangsoftPlugin from 'main';


export interface LangsoftPluginSettings {
	unknownEnabled: boolean,
	unknownColor: string,
	semiknownEnabled: boolean,
	semiknownColor: string,
	knownEnabled: boolean,
	knownColor: string,
	user: string,
	dictionaryFolder: string
}

export const DEFAULT_SETTINGS: LangsoftPluginSettings = {
	unknownEnabled: true,
	unknownColor: "#FF0000",
	semiknownEnabled: true,
	semiknownColor: "#FFFF00",
	knownEnabled: true,
	knownColor: "#93FF85",
	user: "ben",
	dictionaryFolder: ".langsoft_dictionaries"
}


export class LangsoftSettingsTab extends PluginSettingTab {
	plugin: LangsoftPlugin;

	hide(): void {
		// Perform any cleanup or actions you need
		this.plugin.saveSettings()
		super.hide();
	}

	constructor(app: App, plugin: LangsoftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("b", { text: "Word Highlighting" })
		const unknowns = new Setting(containerEl)
			.setName("Unknown")
			.setDesc("")
		let unknownToggle: HTMLElement;
		unknowns.addToggle(toggle => {
			unknownToggle = toggle.toggleEl;
			unknownToggle.parentElement?.parentElement?.prepend(unknownToggle);
			toggle.setValue(this.plugin.settings.unknownEnabled)
				.setTooltip("Enable / Disable")
				.onChange(async (value) => {
					this.plugin.settings.unknownEnabled = value;
					// await this.plugin.saveSettings();
					this.plugin.updateStyle();
				})

		}
		);


		unknowns.addColorPicker(component => component
			.setValue(this.plugin.settings.unknownColor)
			.onChange(async (value) => {
				this.plugin.settings.unknownColor = value;
				// await this.plugin.saveSettings();
				this.plugin.updateStyle();
			}));


		const semiKnowns = new Setting(containerEl).setName("Semi Known");
		let semiKnownToggle: HTMLElement;

		semiKnowns.addToggle(toggle => {
			semiKnownToggle = toggle.toggleEl;
			semiKnownToggle.parentElement?.parentElement?.prepend(semiKnownToggle);

			toggle.setValue(this.plugin.settings.semiknownEnabled)
				.setTooltip("Enable / Disable")
				.onChange(async (value) => {
					this.plugin.settings.semiknownEnabled = value;
					// await this.plugin.saveSettings();
					this.plugin.updateStyle();
				})
		}
		);

		semiKnowns.addColorPicker(component => component
			.setValue(this.plugin.settings.semiknownColor)
			.onChange(async (value) => {
				this.plugin.settings.semiknownColor = value;
				// await this.plugin.saveSettings();
				this.plugin.updateStyle();
			}));



		const knowns = new Setting(containerEl).setName("Known");
		let knownToggle: HTMLElement;

		knowns.addToggle(toggle => {
			knownToggle = toggle.toggleEl;
			knownToggle.parentElement?.parentElement?.prepend(knownToggle);

			toggle.setValue(this.plugin.settings.knownEnabled)
				.setTooltip("Enable / Disable")
				.onChange(async (value) => {
					this.plugin.settings.knownEnabled = value;
					// await this.plugin.saveSettings();
					this.plugin.updateStyle();
				})
		}
		);

		knowns.addColorPicker(component => component
			.setValue(this.plugin.settings.knownColor)
			.onChange(async (value) => {
				this.plugin.settings.knownColor = value;
				// await this.plugin.saveSettings();
				this.plugin.updateStyle();
			}));



		let tac: TextComponent;
		new Setting(containerEl)
			.setName("Dictionaries Folder")
			.setDesc('This is the name of the folder used to store dictionaries in JSON format. If the folder does not exist yet it will be automatically created. If the name starts with a "." that means it is a hidden folder. ')
			.addExtraButton((b) => {
				b.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.dictionaryFolder = DEFAULT_SETTINGS.dictionaryFolder;
						// await this.plugin.saveSettings();
						tac.setValue(this.plugin.settings.dictionaryFolder)
					});
			})
			.addText((c: TextComponent) => {
				tac = c;
				c.setValue(this.plugin.settings.dictionaryFolder);
				c.onChange(async (value: string) => {
					const newValue = value.trim().length === 0 ? DEFAULT_SETTINGS.dictionaryFolder : value.trim();
					this.plugin.settings.dictionaryFolder = newValue;
					// await this.plugin.saveSettings();
				})
			});


		containerEl.createEl("b", { text: "User & language" })
		const list: string[] = ["user 1", "user 2", "user 3"];
		// let tacUser: TextComponent;
		const users = new Setting(containerEl)
			.setName("Current user")
			.setDesc("If you want to create a new user, just enter a name that doesn't exist yet.")
			.addText((c: TextComponent) => {
				tac = c;
				c.setValue(this.plugin.settings.user);
				c.onChange(async (value: string) => {
					const newValue = value.trim().length === 0 ? DEFAULT_SETTINGS.user : value.trim();
					this.plugin.settings.user = newValue;
					// await this.plugin.saveSettings();
				});
			});
		users.addDropdown((dropdown) => {
			list.forEach((item) => {
				dropdown.addOption(item, item.toLowerCase().replace(/\s+/g, '_'));

			});
			dropdown.onChange(async (value: string) => {
				const newValue = value.trim().length === 0 ? DEFAULT_SETTINGS.user : value.trim();
				this.plugin.settings.user = newValue;
				// await this.plugin.saveSettings();
				tac.setValue(this.plugin.settings.user);
			})
		});





		// // let dropComp: DropdownComponent;
		// new Setting(containerEl)
		// .setName("Pick another user")
		// .setDesc("Here is a list of other users sharing this vault")






		// 		new Setting(containerEl)
		// 			.setName('Words to Highlight')
		// 			.setDesc('just for testing')
		// 			.addTextArea(text => text
		// 				.setValue(this.plugin.settings.wordsToOverride)
		// 				.setPlaceholder(`snowy: adjective
		// cloud: noun`)
		// 				.onChange(async (value) => {
		// 					this.plugin.settings.wordsToOverride = value;
		// 					this.plugin.loadWordsToOverrideDict();

		// 					this.plugin.reloadEditorExtensions();
		// 					debounce(() => {
		// 						this.plugin.reloadEditorExtensions();
		// 					}, 1000);

		// 					await this.plugin.saveSettings();
		// 				}));


		// 		new Setting(containerEl)
		// 		.setName('CSS class to apply syntax highlighting to')
		// 		.setDesc('If specified, the syntax highlighting will only be applied to notes with the "cssclass" property in their YAML equal to the specified value.')
		// 		.addText(text => text
		// 			.setValue(this.plugin.settings.classToApplyHighlightingTo)
		// 			.onChange(async (value) => {
		// 				this.plugin.settings.classToApplyHighlightingTo = value;
		// 				await this.plugin.saveSettings();
		// 				this.plugin.reloadStyle();
		// 			}));
	}
}
