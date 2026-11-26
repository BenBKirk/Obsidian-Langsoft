import { beforeEach, describe, expect, it } from "vitest";
import { Notice } from "./obsidian-stub";
import { FakeAdapter, FOLDER, LEGACY, makeManager, putDevice, readDevice } from "./fake-vault";
import type { DictionaryData } from "../dictionaries";

// Older layouts, which are read and merged in but never written:
// - 1.2: one file per user in the dictionary folder (FLAT)
// - 1.1 and earlier: one file per user in the hidden folder (OLD)

const FLAT = `${FOLDER}/maria.json`;
const OLD = `${LEGACY}/maria.json`;

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

describe("your dictionary from an older version", () => {
	it("is copied into this device's file on the first run, leaving the old file alone", async () => {
		adapter.put(FLAT, { hund: word("known", "dog") });
		const before = { ...adapter.files.get(FLAT)! };
		const { manager } = await makeManager(adapter);

		expect(readDevice(adapter)).toEqual({ hund: word("known", "dog") });
		expect(manager.userDict.hund.highlight).toBe("known");
		expect(adapter.files.get(FLAT)).toEqual(before);
		expect(Notice.shown.join()).toMatch(/now saved on this device/);
	});

	it("is copied from the old hidden folder too", async () => {
		adapter.put(OLD, { hund: word("known", "dog") });
		await makeManager(adapter);

		expect(readDevice(adapter)).toEqual({ hund: word("known", "dog") });
	});

	it("is merged from every layout at once", async () => {
		adapter.put(FLAT, { hund: word("known", "dog") });
		adapter.put(OLD, { katze: word("unknown", "cat") });
		putDevice(adapter, { maus: word("unknown", "mouse") }, "maria", "mobile-0000ffff");
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.userDict).sort()).toEqual(["hund", "katze", "maus"]);
		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "katze", "maus"]);
	});

	it("keeps being merged in when a device on an older version changes it", async () => {
		adapter.put(FLAT, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);

		// the phone, still on 1.2, adds a word
		adapter.put(FLAT, { hund: word("known", "dog"), maus: word("unknown", "mouse", "2026-01-02 10:00:00") });
		await manager.reloadOtherDictsIfChanged();
		await manager.flush();

		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "maus"]);
	});

	it("is never written to", async () => {
		adapter.put(FLAT, { hund: word("known", "dog") });
		adapter.put(OLD, { hund: word("known", "dog") });
		const before = [{ ...adapter.files.get(FLAT)! }, { ...adapter.files.get(OLD)! }];
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("katze", "unknown", "cat", { deleted: false, timestamp: "2026-01-02 10:00:00", sentence: "" });
		await manager.writeUserDictToJson();

		expect([adapter.files.get(FLAT), adapter.files.get(OLD)]).toEqual(before);
	});

	it("is left out with a notice when it can't be read, and not overwritten", async () => {
		adapter.put(FLAT, "{ broken");
		const { manager } = await makeManager(adapter);

		expect(manager.userDict).toEqual({});
		expect(adapter.files.get(FLAT)!.data).toBe("{ broken");
		expect(Notice.shown.join()).toMatch(/maria\.json can't be read/);
	});
});

describe("conflict copies of your dictionary", () => {
	it("have their words merged in, with a notice", async () => {
		adapter.put(FLAT, { hund: word("known", "dog") });
		// the side that lost the conflict had a word the other didn't
		adapter.put(`${FOLDER}/maria.sync-conflict-20261125-143012-ABC1234.json`, { katze: word("unknown", "cat") });
		adapter.put(`${LEGACY}/maria.sync-conflict-20261120-090000-ABC1234.json`, { maus: word("unknown", "mouse") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.userDict).sort()).toEqual(["hund", "katze", "maus"]);
		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "katze", "maus"]);
		expect(Notice.shown.filter((n) => /conflict copy/.test(n))).toHaveLength(2);
		expect(manager.otherDicts).toEqual({});
	});
});

describe("coworkers on older versions", () => {
	it("are shown from the old hidden folder", async () => {
		putDevice(adapter, {});
		adapter.put(`${LEGACY}/peter.json`, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("have every layout merged", async () => {
		putDevice(adapter, {});
		putDevice(adapter, { hund: word("known", "dog") }, "peter");
		adapter.put(`${FOLDER}/peter.json`, { katze: word("unknown", "cat") });
		adapter.put(`${LEGACY}/peter.json`, { maus: word("unknown", "mouse") });
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts.peter).sort()).toEqual(["hund", "katze", "maus"]);
	});

	it("are reloaded when an old file changes", async () => {
		putDevice(adapter, {});
		putDevice(adapter, { hund: word("known", "dog") }, "peter");
		adapter.put(`${LEGACY}/peter.json`, {});
		const { manager } = await makeManager(adapter);

		adapter.put(`${LEGACY}/peter.json`, { katze: word("unknown", "cat") });
		await manager.reloadOtherDictsIfChanged();

		expect(Object.keys(manager.otherDicts.peter).sort()).toEqual(["hund", "katze"]);
	});
});

describe("with a folder of your own choosing", () => {
	it("the old hidden folder is ignored", async () => {
		adapter.put("Mine/maria/desktop-0000test.json", JSON.stringify({ format: 2, words: {} }));
		adapter.put(OLD, { hund: word("known", "dog") });
		adapter.put(`${LEGACY}/peter.json`, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter, "maria", "Mine");

		expect(manager.userDict).toEqual({});
		expect(manager.otherDicts).toEqual({});
	});
});
