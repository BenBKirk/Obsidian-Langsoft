import { App, Modal, Notice, Setting } from "obsidian";
import type LangsoftPlugin from "main";
import { checkNewUserName } from "users";

/** "Who are you?": choose an existing user or create a new one. */
export class UserModal extends Modal {
	plugin: LangsoftPlugin;
	onDone?: () => void;

	constructor(app: App, plugin: LangsoftPlugin, onDone?: () => void) {
		super(app);
		this.plugin = plugin;
		this.onDone = onDone;
	}

	onOpen() {
		void this.render();
	}

	private async render() {
		const { contentEl, titleEl } = this;
		titleEl.setText("Who are you?");
		contentEl.createEl("p", {
			text: "Langsoft saves your definitions in a dictionary under your name. Your choice is remembered on this device only.",
		});

		const current = this.plugin.currentUser;
		const users = await this.plugin.listUsers();

		if (users.length > 0) {
			new Setting(contentEl).setName("Existing users").setHeading();
			for (const user of users) {
				const row = new Setting(contentEl).setName(user);
				row.addButton((button) => {
					if (user === current) {
						button.setButtonText("Current").setDisabled(true);
					} else {
						button.setButtonText("This is me").setCta().onClick(() => this.choose(user));
					}
				});
			}
		}

		new Setting(contentEl).setName("New user").setHeading();
		let input = "";
		// created here, shown below the field further down
		const errorEl = createDiv({ cls: "langsoft-user-error" });
		const create = async () => {
			// check against a fresh list, in case a dictionary synced in while this was open
			const result = checkNewUserName(input, await this.plugin.listUsers());
			if ("error" in result) {
				errorEl.setText(result.error);
				return;
			}
			await this.plugin.createUser(result.name);
			await this.choose(result.name);
		};

		new Setting(contentEl)
			.setName("Name")
			.setDesc(
				"Already using Langsoft on another device? Wait until your dictionaries have synced and choose your name above, rather than creating it again."
			)
			.addText((text) => {
				text.setPlaceholder("Your name").onChange((value) => {
					input = value;
					errorEl.setText("");
				});
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						void create();
					}
				});
				if (users.length === 0) {
					window.setTimeout(() => text.inputEl.focus(), 0);
				}
			})
			.addButton((button) => button.setButtonText("Create").onClick(create));
		contentEl.appendChild(errorEl);
	}

	private async choose(user: string) {
		await this.plugin.switchUser(user);
		new Notice(`Langsoft: you are now ${user}`);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
		this.onDone?.();
	}
}
