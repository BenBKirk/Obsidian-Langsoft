import { App, Modal, Notice, Setting, SuggestModal } from "obsidian";
import { formatRecent } from "time";
import type LangsoftPlugin from "main";
import { BackupInfo, decodeBackup, listBackups, makeBackup, planRestore, RestoreItem } from "backup";

/** How long the "Undo" in the notice after a restore stays, in milliseconds. */
const UNDO_TIME = 15000;

export function formatSize(bytes: number): string {
	return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatBackupDate(date: Date): string {
	return formatRecent(date);
}

/** Save a backup now, and say so. */
export async function backupNow(plugin: LangsoftPlugin) {
	if (!plugin.currentUser) {
		new Notice('Langsoft: choose who you are first, with the command "Langsoft: Switch user".');
		return;
	}
	try {
		await plugin.dictManager.flush();
		const path = await makeBackup(plugin.app.vault.adapter, plugin.currentUser, plugin.dictManager.userDict);
		new Notice(`Langsoft: backed up your dictionary to “${path}”.`);
	} catch (e) {
		new Notice(`Langsoft: could not back up: ${e}`);
	}
}

/** "Langsoft: Restore from a backup": choose a backup, see what it would bring back, confirm. */
export async function openRestore(plugin: LangsoftPlugin) {
	if (!plugin.currentUser) {
		new Notice('Langsoft: choose who you are first, with the command "Langsoft: Switch user".');
		return;
	}
	const backups = await listBackups(plugin.app.vault.adapter, plugin.currentUser);
	if (backups.length === 0) {
		new Notice(`Langsoft: you have no backups yet. To restore another file, copy it into “Langsoft backups/${plugin.currentUser}”.`);
		return;
	}
	new BackupPicker(plugin.app, plugin, backups).open();
}

class BackupPicker extends SuggestModal<BackupInfo> {
	constructor(app: App, private plugin: LangsoftPlugin, private backups: BackupInfo[]) {
		super(app);
		this.setPlaceholder("Choose a backup to bring back what is missing from it");
	}

	getSuggestions(query: string): BackupInfo[] {
		const q = query.toLowerCase();
		return this.backups.filter((b) => formatBackupDate(b.date).toLowerCase().includes(q) || b.path.toLowerCase().includes(q));
	}

	renderSuggestion(backup: BackupInfo, el: HTMLElement) {
		el.createDiv({ text: formatBackupDate(backup.date) });
		el.createDiv({ cls: "langsoft-search-context", text: `${backup.path.slice(backup.path.lastIndexOf("/") + 1)} · ${formatSize(backup.size)}` });
	}

	onChooseSuggestion(backup: BackupInfo) {
		void this.choose(backup);
	}

	private async choose(backup: BackupInfo) {
		const decoded = await decodeBackup(await this.plugin.app.vault.adapter.readBinary(backup.path));
		if ("error" in decoded) {
			new Notice(`Langsoft: this backup can't be read: ${decoded.error}.`);
			return;
		}
		await this.plugin.dictManager.flush();
		const plan = planRestore(this.plugin.dictManager.userDict, decoded.words);
		new RestorePreview(this.app, this.plugin, backup, plan).open();
	}
}

class RestorePreview extends Modal {
	constructor(app: App, private plugin: LangsoftPlugin, private backup: BackupInfo, private plan: RestoreItem[]) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText(`Backup from ${formatBackupDate(this.backup.date)}`);
		const el = this.contentEl;
		el.addClass("langsoft-restore");
		if (this.plan.length === 0) {
			el.createEl("p", { text: "Nothing is missing: everything in this backup is in your dictionary now." });
			new Setting(el).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
			return;
		}

		const words = this.plan.filter((i) => i.wholeWord);
		const definitions = this.plan.filter((i) => !i.wholeWord).reduce((sum, i) => sum + i.definitions.length, 0);
		const parts: string[] = [];
		if (words.length) parts.push(`${words.length} ${words.length === 1 ? "word" : "words"} you no longer have`);
		if (definitions) parts.push(`${definitions} deleted ${definitions === 1 ? "definition" : "definitions"} of words you still have`);
		el.createEl("p", { text: `This brings back ${parts.join(", and ")}. Nothing you've added or changed since is touched.` });

		const list = el.createDiv({ cls: "langsoft-restore-list" });
		for (const item of this.plan.slice(0, 40)) {
			const row = list.createDiv();
			row.createEl("b", { text: item.term });
			row.appendText(` ${item.wholeWord ? "" : "+ "}${item.definitions.map((d) => d.definition).join(" / ")}`);
		}
		if (this.plan.length > 40) list.createDiv({ cls: "langsoft-search-context", text: `and ${this.plan.length - 40} more` });

		el.createEl("p", { cls: "langsoft-search-context", text: "A backup of your dictionary as it is now is made first, and you can undo straight afterwards." });
		new Setting(el)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Bring back")
					.setCta()
					.onClick(async () => {
						this.close();
						await restore(this.plugin, this.plan);
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

async function restore(plugin: LangsoftPlugin, plan: RestoreItem[]) {
	const manager = plugin.dictManager;
	try {
		await manager.flush();
		// a safety copy of how things are now
		await makeBackup(plugin.app.vault.adapter, plugin.currentUser, manager.userDict);
	} catch (e) {
		new Notice(`Langsoft: not restoring, because a backup of your dictionary as it is now could not be made: ${e}`);
		return;
	}
	manager.applyRestore(plan);

	const fragment = createFragment();
	const count = plan.length;
	fragment.appendText(`Langsoft: brought back ${count} ${count === 1 ? "word" : "words"}. `);
	const undo = fragment.createEl("a", { text: "Undo", href: "#" });
	const notice = new Notice(fragment, UNDO_TIME);
	undo.addEventListener("click", (event) => {
		event.preventDefault();
		notice.hide();
		manager.undoRestore(plan);
		new Notice("Langsoft: restore undone.");
	});
}
