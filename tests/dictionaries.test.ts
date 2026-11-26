import { beforeEach, describe, expect, it } from "vitest";
import { Notice } from "./obsidian-stub";
import { FakeAdapter, FOLDER, makeManager } from "./fake-vault";
import type { Definition, DictionaryData } from "../dictionaries";

const OWN = `${FOLDER}/maria.json`;

const context = (timestamp = "2026-01-01 10:00:00"): Definition => ({
	deleted: false,
	timestamp,
	file: "note.md",
	sentence: "ein <u>Hund </u>bellt",
});

const word = (highlight: string, definition: string, timestamp = "2026-01-01 10:00:00"): DictionaryData[string] => ({
	highlight,
	definitions: { [definition]: context(timestamp) },
	highlighthistory: [{ level: highlight, timestamp }],
	firstwordofphrase: [],
});

let adapter: FakeAdapter;

beforeEach(() => {
	adapter = new FakeAdapter();
	Notice.shown = [];
});

describe("saving your own dictionary", () => {
	it("saves changes", async () => {
		adapter.put(OWN, {});
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("hund", "unknown", "dog", context());
		await manager.writeUserDictToJson();

		expect(adapter.json(OWN).hund.definitions.dog.sentence).toBe("ein <u>Hund </u>bellt");
	});

	it("keeps words another device synced in after the dictionary was loaded", async () => {
		adapter.put(OWN, { hund: word("unknown", "dog") });
		const { manager, plugin } = await makeManager(adapter);
		plugin.refreshHighlights.mockClear();

		// the phone adds a word and Syncthing brings the file over
		adapter.put(OWN, { hund: word("unknown", "dog"), katze: word("known", "cat", "2026-01-02 09:00:00") });

		// meanwhile, the laptop (still holding the old copy) adds a word and saves
		manager.addNewDefinition("maus", "unknown", "mouse", context("2026-01-02 10:00:00"));
		await manager.writeUserDictToJson();

		expect(Object.keys(adapter.json(OWN)).sort()).toEqual(["hund", "katze", "maus"]);
		expect(manager.userDict.katze.highlight).toBe("known");
		expect(plugin.refreshHighlights).toHaveBeenCalled();
	});

	it("does not need to merge when nothing else changed the file", async () => {
		adapter.put(OWN, { hund: word("unknown", "dog") });
		const { manager, plugin } = await makeManager(adapter);

		manager.addNewDefinition("maus", "unknown", "mouse", context());
		await manager.writeUserDictToJson();
		manager.addNewDefinition("katze", "unknown", "cat", context());
		await manager.writeUserDictToJson();
		plugin.refreshHighlights.mockClear();

		manager.markDefinitionDeleted("katze", "cat");
		await manager.writeUserDictToJson();

		expect(adapter.json(OWN).katze.definitions.cat.deleted).toBe(true);
		// only the refresh markDefinitionDeleted asks for itself
		expect(plugin.refreshHighlights).toHaveBeenCalledTimes(1);
	});

	it("saves in order when several saves are started at once", async () => {
		adapter.put(OWN, {});
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("a", "unknown", "x", context());
		const first = manager.writeUserDictToJson();
		manager.addNewDefinition("b", "unknown", "y", context());
		const second = manager.writeUserDictToJson();
		await Promise.all([first, second]);

		expect(Object.keys(adapter.json(OWN)).sort()).toEqual(["a", "b"]);
	});

	it("overwrites a file that isn't valid JSON instead of failing", async () => {
		adapter.put(OWN, { hund: word("unknown", "dog") });
		const { manager } = await makeManager(adapter);
		adapter.put(OWN, "{ broken");

		await manager.writeUserDictToJson();

		expect(adapter.json(OWN).hund.highlight).toBe("unknown");
	});

	it("does not create a dictionary that wasn't set up, and says so", async () => {
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("hund", "unknown", "dog", context());
		await manager.writeUserDictToJson();

		expect(adapter.files.has(OWN)).toBe(false);
		expect(Notice.shown.join()).toMatch(/not saved/);
	});

	it("does not write anything with no user name", async () => {
		adapter.put(`${FOLDER}/.json`, {});
		const { manager } = await makeManager(adapter, "");

		await manager.writeUserDictToJson();

		expect(adapter.json(`${FOLDER}/.json`)).toEqual({});
		expect(Notice.shown.join()).toMatch(/not saved/);
	});
});

describe("picking up changes from other devices", () => {
	it("merges in your own dictionary when it changed on disk", async () => {
		adapter.put(OWN, { hund: word("unknown", "dog") });
		const { manager, plugin } = await makeManager(adapter);
		plugin.refreshHighlights.mockClear();

		adapter.put(OWN, { hund: word("known", "dog", "2026-01-03 10:00:00") });
		await manager.reloadUserDictIfChanged();

		expect(manager.userDict.hund.highlight).toBe("known");
		expect(plugin.refreshHighlights).toHaveBeenCalled();
	});

	it("does nothing when it hasn't changed", async () => {
		adapter.put(OWN, { hund: word("unknown", "dog") });
		const { manager, plugin } = await makeManager(adapter);
		plugin.refreshHighlights.mockClear();

		await manager.reloadUserDictIfChanged();

		expect(plugin.refreshHighlights).not.toHaveBeenCalled();
	});
});

describe("coworkers' dictionaries", () => {
	it("are named after their file, whatever the folder is called", async () => {
		adapter.put(OWN, {});
		adapter.put(`${FOLDER}/peter.json`, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("skip Syncthing conflict copies, and mention copies of your own", async () => {
		adapter.put(OWN, {});
		adapter.put(`${FOLDER}/maria.sync-conflict-20261125-143012-ABC1234.json`, { hund: word("known", "dog") });
		adapter.put(`${FOLDER}/peter.sync-conflict-20261125-143012-ABC1234.json`, {});
		const { manager } = await makeManager(adapter);

		expect(manager.otherDicts).toEqual({});
		expect(Notice.shown).toHaveLength(1);
		expect(Notice.shown[0]).toMatch(/maria\.sync-conflict/);

		// only once
		await manager.reloadOtherDictsIfChanged();
		expect(Notice.shown).toHaveLength(1);
	});

	it("are reloaded when they change, added when new and dropped when removed", async () => {
		adapter.put(OWN, {});
		adapter.put(`${FOLDER}/peter.json`, { hund: word("unknown", "dog") });
		const { manager, plugin } = await makeManager(adapter);
		plugin.refreshHighlights.mockClear();

		await manager.reloadOtherDictsIfChanged();
		expect(plugin.refreshHighlights).not.toHaveBeenCalled();

		adapter.put(`${FOLDER}/peter.json`, { hund: word("known", "dog") });
		adapter.put(`${FOLDER}/anna.json`, { katze: word("known", "cat") });
		await manager.reloadOtherDictsIfChanged();
		expect(manager.otherDicts.peter.hund.highlight).toBe("known");
		expect(Object.keys(manager.otherDicts).sort()).toEqual(["anna", "peter"]);
		expect(plugin.refreshHighlights).toHaveBeenCalled();

		adapter.files.delete(`${FOLDER}/anna.json`);
		await manager.reloadOtherDictsIfChanged();
		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("retry a file that failed to load", async () => {
		adapter.put(OWN, {});
		adapter.put(`${FOLDER}/peter.json`, "{ half-synced");
		const { manager } = await makeManager(adapter);
		expect(manager.otherDicts).toEqual({});

		const file = adapter.files.get(`${FOLDER}/peter.json`)!;
		file.data = JSON.stringify({ hund: word("known", "dog") }); // same mtime
		await manager.reloadOtherDictsIfChanged();
		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});
});
