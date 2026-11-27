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
	/** Show how much of a note you know, at the bottom of the note. */
	showNoteCoverage: boolean,
	/** Highlight words in Reading view too. */
	highlightReadingView: boolean,
	/** Views saved on the dictionary page, by user, so each person has their own. */
	savedGridViews: Record<string, { name: string; state: Record<string, unknown> }[]>,
	/** Back up your dictionary once a day, when it first changes that day. */
	autoBackup: boolean,
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
	showNoteCoverage: true,
	highlightReadingView: true,
	savedGridViews: {},
	autoBackup: true,
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

		new Setting(containerEl)
			.setName("Back up every day")
			.setDesc('A copy of your dictionary in "Langsoft backups", the first time it changes each day. About 30 are kept. Restore with the command "Langsoft: Restore from a backup".')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoBackup).onChange(async (value) => {
					this.plugin.settings.autoBackup = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Highlight words in Reading view")
			.setDesc("As while editing. Select a word, or Ctrl+click a highlighted one (tap it on a phone), to open it in the Definer.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.highlightReadingView).onChange((value) => {
					this.plugin.settings.highlightReadingView = value;
					this.plugin.refreshHighlights();
				})
			);

		new Setting(containerEl)
			.setName("Show how much of a note you know")
			.setDesc("A bar at the bottom of each note with the share of its words you know, half know or don't know, and the share only your coworkers have defined.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showNoteCoverage).onChange((value) => {
					this.plugin.settings.showNoteCoverage = value;
					this.plugin.refreshHighlights();
				})
			);

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
					this.plugin.updateStyle();
				})

		}
		);


		unknowns.addColorPicker(component => component
			.setValue(this.plugin.settings.unknownColor)
			.onChange(async (value) => {
				this.plugin.settings.unknownColor = value;
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
					this.plugin.updateStyle();
				})
		}
		);

		semiKnowns.addColorPicker(component => component
			.setValue(this.plugin.settings.semiknownColor)
			.onChange(async (value) => {
				this.plugin.settings.semiknownColor = value;
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
					this.plugin.updateStyle();
				})
		}
		);

		knowns.addColorPicker(component => component
			.setValue(this.plugin.settings.knownColor)
			.onChange(async (value) => {
				this.plugin.settings.knownColor = value;
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
					this.plugin.updateStyle();
				})
		}
		);

		coworkers.addColorPicker(component => component
			.setValue(this.plugin.settings.coworkerColor)
			.onChange(async (value) => {
				this.plugin.settings.coworkerColor = value;
				this.plugin.updateStyle();
			}));


	}

}
