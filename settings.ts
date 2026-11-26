import { App, PluginSettingTab, Setting } from 'obsidian';
import LangsoftPlugin from 'main';
import { DEFAULT_FOLDER } from 'dictionary-files';


export interface LangsoftPluginSettings {
	unknownEnabled: boolean,
	unknownColor: string,
	semiknownEnabled: boolean,
	semiknownColor: string,
	knownEnabled: boolean,
	knownColor: string,
	coworkerEnabled: boolean,
	coworkerColor: string,
	/**
	 * Only read to carry over the user from older versions. The current user
	 * is now stored on each device (see LangsoftPlugin.currentUser), because
	 * this file can be synced between people.
	 */
	currentUser?: string,
	dictionaryFolder: string
}

export const DEFAULT_SETTINGS: LangsoftPluginSettings = {
	unknownEnabled: true,
	unknownColor: "#FF0000",
	semiknownEnabled: true,
	semiknownColor: "#FFFF00",
	knownEnabled: true,
	knownColor: "#00FF00",
	coworkerEnabled: true,
	coworkerColor: "#0080FF",
	dictionaryFolder: DEFAULT_FOLDER
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

	private displayUserSetting(containerEl: HTMLElement) {
		new Setting(containerEl).setName("User").setHeading();
		const setting = new Setting(containerEl)
			.setName("You are")
			.setDesc("Your definitions are saved in this user's dictionary. Remembered on this device only.");

		setting.addDropdown((dropdown) => {
			const current = this.plugin.currentUser;
			this.plugin.listUsers().then((users) => {
				if (!current || !users.includes(current)) {
					dropdown.addOption(current, current ? `${current} (no dictionary)` : "Choose…");
				}
				for (const user of users) dropdown.addOption(user, user);
				dropdown.setValue(current);
				dropdown.onChange(async (value) => {
					if (value) await this.plugin.switchUser(value);
				});
			});
		});
		setting.addButton((button) =>
			button.setButtonText("New user…").onClick(() => this.plugin.openUserPicker(() => this.display()))
		);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		this.displayUserSetting(containerEl);

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

		const coworkers = new Setting(containerEl).setName("Coworkers");
		let coworkerToggle: HTMLElement;

		coworkers.addToggle(toggle => {
			coworkerToggle = toggle.toggleEl;
			coworkerToggle.parentElement?.parentElement?.prepend(coworkerToggle);

			toggle.setValue(this.plugin.settings.coworkerEnabled)
				.setTooltip("Enable / Disable")
				.onChange(async (value) => {
					this.plugin.settings.coworkerEnabled = value;
					// await this.plugin.saveSettings();
					this.plugin.updateStyle();
				})
		}
		);

		coworkers.addColorPicker(component => component
			.setValue(this.plugin.settings.coworkerColor)
			.onChange(async (value) => {
				this.plugin.settings.coworkerColor = value;
				// await this.plugin.saveSettings();
				this.plugin.updateStyle();
			}));


		// let tac: TextComponent;
		// new Setting(containerEl)
		// 	.setName("Dictionaries Folder")
		// 	.setDesc('This is the name of the folder used to store dictionaries in JSON format. If the folder does not exist yet it will be automatically created. If the name starts with a "." that means it is a hidden folder. ')
		// 	.addExtraButton((b) => {
		// 		b.setIcon("reset")
		// 			.setTooltip("Reset to default")
		// 			.onClick(async () => {
		// 				this.plugin.settings.dictionaryFolder = DEFAULT_SETTINGS.dictionaryFolder;
		// 				// await this.plugin.saveSettings();
		// 				tac.setValue(this.plugin.settings.dictionaryFolder)
		// 			});
		// 	})
		// 	.addText((c: TextComponent) => {
		// 		tac = c;
		// 		c.setValue(this.plugin.settings.dictionaryFolder);
		// 		c.onChange(async (value: string) => {
		// 			const newValue = value.trim().length === 0 ? DEFAULT_SETTINGS.dictionaryFolder : value.trim();
		// 			this.plugin.settings.dictionaryFolder = newValue;
		// 			// await this.plugin.saveSettings();
		// 		})
		// 	});


	}

}
