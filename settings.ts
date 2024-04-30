import { App, PluginSettingTab, Setting, debounce } from 'obsidian';
import LangsoftPlugin from 'main';


export interface LangsoftPluginSettings {
	unknownEnabled: boolean,
	unknownColor: string,
	semiKnownEnabled: boolean,
	semiKnownColor: string,
	knownEnabled: boolean,
	knownColor: string,
	classToApplyHighlightingTo: string,
	wordsToOverride: string,
}

export const DEFAULT_SETTINGS: LangsoftPluginSettings = {
	unknownEnabled: true,
	unknownColor: "FF0000",
	semiKnownEnabled: true,
	semiKnownColor: "#FFFF00",
	knownEnabled: true,
	knownColor: "#93FF85",
	classToApplyHighlightingTo: "",
	wordsToOverride: "",
}


export class LangsoftSettingsTab extends PluginSettingTab {
	plugin: LangsoftPlugin;

	constructor(app: App, plugin: LangsoftPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();



		const unknowns = new Setting(containerEl).setName("Unknown Words");
		let unknownToggle:HTMLElement;

		unknowns.addToggle(toggle =>
			{
				unknownToggle = toggle.toggleEl;
				unknownToggle.parentElement?.parentElement?.prepend(unknownToggle);
				toggle.setValue(this.plugin.settings.unknownEnabled)
					.onChange(async (value) => {
						this.plugin.settings.unknownEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.reloadStyle();
					})
			}
		);

		unknowns.addColorPicker(component => component
			.setValue(this.plugin.settings.unknownColor)
			.onChange(async (value) => {
				this.plugin.settings.unknownColor = value;
				await this.plugin.saveSettings();
				this.plugin.reloadStyle();
		}));



		const semiKnowns = new Setting(containerEl).setName("Semi Known Words");
		let semiKnownToggle:HTMLElement;

		semiKnowns.addToggle(toggle =>
			{
				semiKnownToggle = toggle.toggleEl;
				semiKnownToggle.parentElement?.parentElement?.prepend(semiKnownToggle);

				toggle.setValue(this.plugin.settings.semiKnownEnabled)
					.onChange(async (value) => {
						this.plugin.settings.semiKnownEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.reloadStyle();
					})
			}
		);

		semiKnowns.addColorPicker(component => component
			.setValue(this.plugin.settings.semiKnownColor)
			.onChange(async (value) => {
				this.plugin.settings.semiKnownColor = value;
				await this.plugin.saveSettings();
				this.plugin.reloadStyle();
		}));



		const knowns = new Setting(containerEl).setName("Known Words");
		let knownToggle:HTMLElement;

		knowns.addToggle(toggle =>
			{
				knownToggle = toggle.toggleEl;
				knownToggle.parentElement?.parentElement?.prepend(knownToggle);

				toggle.setValue(this.plugin.settings.knownEnabled)
					.onChange(async (value) => {
						this.plugin.settings.knownEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.reloadStyle();
					})
			}
		);

		knowns.addColorPicker(component => component
			.setValue(this.plugin.settings.knownColor)
			.onChange(async (value) => {
				this.plugin.settings.knownColor = value;
				await this.plugin.saveSettings();
				this.plugin.reloadStyle();
		}));


		


		new Setting(containerEl)
			.setName('Words to Highlight')
			.setDesc('just for testing')
			.addTextArea(text => text
				.setValue(this.plugin.settings.wordsToOverride)
				.setPlaceholder(`snowy: adjective
cloud: noun`)
				.onChange(async (value) => {
					this.plugin.settings.wordsToOverride = value;
					this.plugin.loadWordsToOverrideDict();

					this.plugin.reloadEditorExtensions();
					debounce(() => {
						this.plugin.reloadEditorExtensions();
					}, 1000);

					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
		.setName('CSS class to apply syntax highlighting to')
		.setDesc('If specified, the syntax highlighting will only be applied to notes with the "cssclass" property in their YAML equal to the specified value.')
		.addText(text => text
			.setValue(this.plugin.settings.classToApplyHighlightingTo)
			.onChange(async (value) => {
				this.plugin.settings.classToApplyHighlightingTo = value;
				await this.plugin.saveSettings();
				this.plugin.reloadStyle();
			}));

	}
}