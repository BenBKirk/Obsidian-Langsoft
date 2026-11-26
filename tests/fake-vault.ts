// An in-memory stand-in for Obsidian's vault.adapter, with a clock for modification times.
import { vi } from "vitest";
import { DictionaryManager } from "../dictionaries";
import { parseIntoWords } from "../words";
import { serializeDeviceFile } from "../dictionary-files";
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
	/** Like Obsidian's adapter: the files and folders directly inside `folder`. */
	async list(folder: string) {
		const parent = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
		const files = [...this.files.keys()].filter((path) => parent(path) === folder);
		const folders = new Set([...this.folders].filter((path) => parent(path) === folder));
		for (const path of this.files.keys()) {
			// folders that exist because files are in them
			let dir = parent(path);
			while (dir !== "" && parent(dir) !== folder && dir.startsWith(`${folder}/`)) dir = parent(dir);
			if (parent(dir) === folder) folders.add(dir);
		}
		return { files, folders: [...folders] };
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

export const FOLDER = "Langsoft";
/** The device ID tests run as, unless they say otherwise. */
export const DEVICE = "desktop-0000test";
export const LEGACY = ".langsoft_dictionaries";

/** Path of a user's file for a device. */
export function deviceFile(user = "maria", device = DEVICE, folder = FOLDER) {
	return `${folder}/${user}/${device}.json`;
}

/** Write a device file as another device (via sync) would. */
export function putDevice(adapter: FakeAdapter, words: unknown, user = "maria", device = DEVICE) {
	adapter.put(deviceFile(user, device), serializeDeviceFile(words));
}

/** The words in a device file. */
export function readDevice(adapter: FakeAdapter, user = "maria", device = DEVICE) {
	return adapter.json(deviceFile(user, device))?.words;
}

export async function makeManager(adapter: FakeAdapter, currentUser = "maria", folder = FOLDER, deviceId = DEVICE) {
	adapter.folders.add(folder);
	const plugin = {
		settings: { dictionaryFolder: folder },
		currentUser,
		deviceId,
		app: { vault: { adapter } },
		refreshHighlights: vi.fn(),
		parseIntoWords,
	};
	const manager = new DictionaryManager(plugin as unknown as LangsoftPlugin);
	await manager.init();
	return { manager, plugin };
}
