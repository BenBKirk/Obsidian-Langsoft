// An in-memory stand-in for Obsidian's vault.adapter, with a clock for modification times.
import { vi } from "vitest";
import { DictionaryManager } from "../dictionaries";
import { parseIntoWords } from "../words";
import type LangsoftPlugin from "../main";

export class FakeAdapter {
	files = new Map<string, { data: string; mtime: number }>();
	folders = new Set<string>();
	private clock = 1000;

	/** Write a file as another program (e.g. Syncthing) would. */
	put(path: string, data: unknown, mtime = ++this.clock) {
		this.files.set(path, { data: typeof data === "string" ? data : JSON.stringify(data), mtime });
	}

	json(path: string) {
		return JSON.parse(this.files.get(path)?.data ?? "null");
	}

	async exists(path: string) {
		return this.files.has(path) || this.folders.has(path);
	}
	async mkdir(path: string) {
		this.folders.add(path);
	}
	async list(folder: string) {
		return { files: [...this.files.keys()].filter((p) => p.startsWith(`${folder}/`)), folders: [] };
	}
	async read(path: string) {
		const file = this.files.get(path);
		if (!file) throw new Error(`no such file: ${path}`);
		return file.data;
	}
	async write(path: string, data: string) {
		this.put(path, data);
	}
	async stat(path: string) {
		const file = this.files.get(path);
		return file ? { type: "file", mtime: file.mtime, ctime: file.mtime, size: file.data.length } : null;
	}
}

export const FOLDER = ".langsoft_dictionaries";

export async function makeManager(adapter: FakeAdapter, currentUser = "maria") {
	adapter.folders.add(FOLDER);
	const plugin = {
		settings: { dictionaryFolder: FOLDER },
		currentUser,
		app: { vault: { adapter } },
		refreshHighlights: vi.fn(),
		parseIntoWords,
	};
	const manager = new DictionaryManager(plugin as unknown as LangsoftPlugin);
	await manager.init();
	return { manager, plugin };
}
