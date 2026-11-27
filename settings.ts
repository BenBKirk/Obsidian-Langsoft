import { App, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
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

	constructor(app: App, plugin: LangsoftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** The settings, described for Obsidian, which draws them and includes them in its settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const levels: [string, "unknown" | "semiknown" | "known" | "coworker", string][] = [
			["Unknown words", "unknown", "Words you've marked unknown."],
			["Semi-known words", "semiknown", "Words you've marked semi-known."],
			["Known words", "known", "Words you've marked known."],
			["Coworkers' words", "coworker", "Words only your coworkers have defined."],
		];
		return [
			{
				type: "group",
				heading: "User",
				items: [
					{
						name: "You are",
						desc: "Your definitions are saved in this user's dictionary. Remembered on this device only.",
						aliases: ["user", "switch user", "who"],
						render: (setting: Setting) => this.renderUserSetting(setting),
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Back up every day",
						desc: 'A copy of your dictionary in "Langsoft backups", the first time it changes each day. About 30 are kept. Restore with the command "Langsoft: Restore from a backup".',
						aliases: ["backup", "restore"],
						control: { type: "toggle", key: "autoBackup" },
					},
					{
						name: "Highlight words in Reading view",
						desc: "As while editing. Select a word, or Ctrl+click a highlighted one (tap it on a phone), to open it in the Definer.",
						control: { type: "toggle", key: "highlightReadingView" },
					},
					{
						name: "Show how much of a note you know",
						desc: "A bar at the bottom of each note with the share of its words you know, half know or don't know, and the share only your coworkers have defined.",
						aliases: ["coverage", "note bar", "percentage"],
						control: { type: "toggle", key: "showNoteCoverage" },
					},
				],
			},
			{
				type: "group",
				heading: "Word highlighting",
				items: levels.map(([name, level, desc]) => ({
					name,
					desc: `${desc} Switch the highlight on or off, and choose its colour.`,
					aliases: ["colour", "color", "highlight"],
					render: (setting: Setting) => this.renderLevelSetting(setting, level),
				})),
			},
		];
	}

	setControlValue(key: string, value: unknown) {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		if (key === "highlightReadingView" || key === "showNoteCoverage") this.plugin.refreshHighlights();
		return this.plugin.saveSettings();
	}

	private renderUserSetting(setting: Setting) {
		setting.addDropdown((dropdown) => {
			const current = this.plugin.currentUser;
			void this.plugin.listUsers().then((users) => {
				if (!current || !users.includes(current)) {
					dropdown.addOption(current, current ? `${current} (no dictionary)` : "Choose…");
				}
				for (const user of users) dropdown.addOption(user, user);
				dropdown.setValue(current);
				dropdown.onChange((value) => {
					if (value) void this.plugin.switchUser(value);
				});
			});
		});
		setting.addButton((button) => button.setButtonText("New user…").onClick(() => this.plugin.openUserPicker(() => this.update())));
	}

	/** A level's highlight: on or off, and its colour. */
	private renderLevelSetting(setting: Setting, level: "unknown" | "semiknown" | "known" | "coworker") {
		const settings = this.plugin.settings;
		const enabledKey = `${level}Enabled` as const;
		const colourKey = `${level}Color` as const;
		setting.addToggle((toggle) =>
			toggle
				.setValue(settings[enabledKey])
				.setTooltip("Highlight on or off")
				.onChange((value) => {
					settings[enabledKey] = value;
					this.plugin.updateStyle();
					void this.plugin.saveSettings();
				})
		);
		setting.addColorPicker((picker) =>
			picker.setValue(settings[colourKey]).onChange((value) => {
				settings[colourKey] = value;
				this.plugin.updateStyle();
				void this.plugin.saveSettings();
			})
		);
	}
}
