import { beforeEach, describe, expect, it } from "vitest";
import { Notice } from "./obsidian-stub";
import { FakeAdapter, FOLDER, LEGACY, makeManager } from "./fake-vault";
import type { DictionaryData } from "../dictionaries";

// Before version 1.2, dictionaries were kept in the hidden folder LEGACY.

const OWN = `${FOLDER}/maria.json`;
const OLD_OWN = `${LEGACY}/maria.json`;

const word = (highlight: string, definition: string, timestamp = "2026-01-01 10:00:00"): DictionaryData[string] => ({
	highlight,
	definitions: { [definition]: { deleted: false, timestamp, file: "note.md", sentence: "" } },
	highlighthistory: [{ level: highlight, timestamp }],
	firstwordofphrase: [],
});

let adapter: FakeAdapter;

beforeEach(() => {
	adapter = new FakeAdapter();
	adapter.folders.add(LEGACY);
	Notice.shown = [];
});

describe("your own dictionary in the old folder", () => {
	it("is copied to the new folder on the first run, leaving the old file alone", async () => {
		adapter.put(OLD_OWN, { hund: word("known", "dog") });
		const before = { ...adapter.files.get(OLD_OWN)! };
		const { manager } = await makeManager(adapter);

		expect(adapter.json(OWN)).toEqual({ hund: word("known", "dog") });
		expect(manager.userDict.hund.highlight).toBe("known");
		expect(adapter.files.get(OLD_OWN)).toEqual(before);
		expect(Notice.shown.join()).toMatch(/copied your dictionary/);
	});

	it("is merged in when it has words the new file doesn't", async () => {
		adapter.put(OWN, { hund: word("known", "dog") });
		adapter.put(OLD_OWN, { hund: word("known", "dog"), katze: word("unknown", "cat") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.userDict).sort()).toEqual(["hund", "katze"]);
		expect(Object.keys(adapter.json(OWN)).sort()).toEqual(["hund", "katze"]);
	});

	it("keeps being merged in when a device on an old version changes it", async () => {
		adapter.put(OLD_OWN, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);

		// the phone, still on 1.1, adds a word to the old file
		adapter.put(OLD_OWN, { hund: word("known", "dog"), maus: word("unknown", "mouse", "2026-01-02 10:00:00") });
		await manager.reloadOtherDictsIfChanged(); // switching notes
		await manager.flush();

		expect(Object.keys(adapter.json(OWN)).sort()).toEqual(["hund", "maus"]);
	});

	it("does not cause a save when nothing changed", async () => {
		adapter.put(OLD_OWN, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);
		const saved = adapter.files.get(OWN)!.mtime;

		await manager.reloadOtherDictsIfChanged();
		await manager.flush();
		const second = await makeManager(adapter); // e.g. restarting Obsidian
		await second.manager.flush();

		expect(adapter.files.get(OWN)!.mtime).toBe(saved);
	});

	it("is not copied when it can't be read", async () => {
		adapter.put(OLD_OWN, "{ broken");
		const { manager } = await makeManager(adapter);

		expect(adapter.files.has(OWN)).toBe(false);
		expect(manager.userDict).toEqual({});
		expect(adapter.files.get(OLD_OWN)!.data).toBe("{ broken");
	});

	it("is never written to", async () => {
		adapter.put(OLD_OWN, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);
		const before = { ...adapter.files.get(OLD_OWN)! };

		manager.addNewDefinition("katze", "unknown", "cat", { deleted: false, timestamp: "2026-01-02 10:00:00", sentence: "" });
		await manager.writeUserDictToJson();

		expect(adapter.files.get(OLD_OWN)).toEqual(before);
		expect(Object.keys(adapter.json(OWN)).sort()).toEqual(["hund", "katze"]);
	});
});

describe("coworkers' dictionaries in the old folder", () => {
	it("are shown for coworkers who haven't updated yet", async () => {
		adapter.put(OWN, {});
		adapter.put(`${LEGACY}/peter.json`, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("are merged with the coworker's file in the new folder", async () => {
		adapter.put(OWN, {});
		adapter.put(`${FOLDER}/peter.json`, { hund: word("known", "dog") });
		adapter.put(`${LEGACY}/peter.json`, { katze: word("unknown", "cat") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts.peter).sort()).toEqual(["hund", "katze"]);
	});

	it("are reloaded when the old file changes", async () => {
		adapter.put(OWN, {});
		adapter.put(`${FOLDER}/peter.json`, { hund: word("known", "dog") });
		adapter.put(`${LEGACY}/peter.json`, {});
		const { manager } = await makeManager(adapter);

		adapter.put(`${LEGACY}/peter.json`, { katze: word("unknown", "cat") });
		await manager.reloadOtherDictsIfChanged();

		expect(Object.keys(manager.otherDicts.peter).sort()).toEqual(["hund", "katze"]);
	});

	it("include your own conflict copies in the notice", async () => {
		adapter.put(OWN, {});
		adapter.put(`${LEGACY}/maria.sync-conflict-20261125-143012-ABC1234.json`, {});
		const { manager } = await makeManager(adapter);

		expect(manager.otherDicts).toEqual({});
		expect(Notice.shown.join()).toMatch(/conflict copy/);
	});
});

describe("with a folder of your own choosing", () => {
	it("the old folder is ignored", async () => {
		adapter.put("Mine/maria.json", {});
		adapter.put(OLD_OWN, { hund: word("known", "dog") });
		adapter.put(`${LEGACY}/peter.json`, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter, "maria", "Mine");

		expect(manager.userDict).toEqual({});
		expect(manager.otherDicts).toEqual({});
	});
});
