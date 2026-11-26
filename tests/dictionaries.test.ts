import { beforeEach, describe, expect, it } from "vitest";
import { Notice } from "./obsidian-stub";
import { deviceFile, FakeAdapter, FOLDER, makeManager, putDevice, readDevice } from "./fake-vault";
import type { Definition, DictionaryData } from "../dictionaries";

const MINE = deviceFile("maria");
const PHONE = "mobile-0000ffff";

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

describe("saving your dictionary", () => {
	it("saves to this device's file", async () => {
		putDevice(adapter, {});
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("hund", "unknown", "dog", context());
		await manager.writeUserDictToJson();

		expect(adapter.json(MINE)).toMatchObject({ format: 2 });
		expect(readDevice(adapter).hund.definitions.dog.sentence).toBe("ein <u>Hund </u>bellt");
	});

	it("creates this device's file for an existing user on a new device", async () => {
		putDevice(adapter, { hund: word("known", "dog") }, "maria", PHONE);
		const { manager } = await makeManager(adapter);

		expect(manager.userDict.hund.highlight).toBe("known");
		expect(readDevice(adapter)).toEqual({ hund: word("known", "dog") });
	});

	it("never writes another device's file", async () => {
		putDevice(adapter, { hund: word("known", "dog") }, "maria", PHONE);
		const phoneFile = { ...adapter.files.get(deviceFile("maria", PHONE))! };
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("katze", "unknown", "cat", context());
		await manager.writeUserDictToJson();

		expect(adapter.files.get(deviceFile("maria", PHONE))).toEqual(phoneFile);
		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "katze"]);
	});

	it("merges in changes made to this device's file by something else", async () => {
		putDevice(adapter, { hund: word("unknown", "dog") });
		const { manager } = await makeManager(adapter);

		// e.g. restored from a backup that had another word
		putDevice(adapter, { hund: word("unknown", "dog"), katze: word("known", "cat") });
		manager.addNewDefinition("maus", "unknown", "mouse", context("2026-01-02 10:00:00"));
		await manager.writeUserDictToJson();

		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "katze", "maus"]);
	});

	it("saves in order when several saves are started at once", async () => {
		putDevice(adapter, {});
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("a", "unknown", "x", context());
		const first = manager.writeUserDictToJson();
		manager.addNewDefinition("b", "unknown", "y", context());
		const second = manager.writeUserDictToJson();
		await Promise.all([first, second]);

		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["a", "b"]);
	});

	it("does not create a dictionary for a user that doesn't exist, and says so", async () => {
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("hund", "unknown", "dog", context());
		await manager.writeUserDictToJson();

		expect(adapter.files.size).toBe(0);
		expect(Notice.shown.join()).toMatch(/not saved/);
	});

	it("does not write anything with no user", async () => {
		const { manager } = await makeManager(adapter, "");

		await manager.writeUserDictToJson();

		expect(adapter.files.size).toBe(0);
		expect(Notice.shown.join()).toMatch(/not saved/);
	});
});

describe("your other devices", () => {
	it("are merged in when their files change", async () => {
		putDevice(adapter, { hund: word("unknown", "dog") });
		const { manager, plugin } = await makeManager(adapter);
		plugin.refreshHighlights.mockClear();

		putDevice(adapter, { katze: word("known", "cat", "2026-01-02 10:00:00") }, "maria", PHONE);
		await manager.reloadOtherDictsIfChanged(); // switching notes
		await manager.flush();

		expect(Object.keys(manager.userDict).sort()).toEqual(["hund", "katze"]);
		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "katze"]);
		expect(plugin.refreshHighlights).toHaveBeenCalled();
	});

	it("take the latest level for a word changed on both", async () => {
		putDevice(adapter, { hund: word("unknown", "dog") });
		putDevice(
			adapter,
			{
				hund: {
					...word("unknown", "dog"),
					highlight: "known",
					highlighthistory: [
						{ level: "unknown", timestamp: "2026-01-01 10:00:00" },
						{ level: "known", timestamp: "2026-01-05 10:00:00" },
					],
				},
			},
			"maria",
			PHONE
		);
		const { manager } = await makeManager(adapter);

		expect(manager.userDict.hund.highlight).toBe("known");
	});

	it("end up with the same words after editing on both, without saving back and forth", async () => {
		putDevice(adapter, {});
		const laptop = await makeManager(adapter, "maria", FOLDER, "desktop-0000aaaa");
		const phone = await makeManager(adapter, "maria", FOLDER, PHONE);

		laptop.manager.addNewDefinition("hund", "unknown", "dog", context());
		await laptop.manager.writeUserDictToJson();
		phone.manager.addNewDefinition("katze", "unknown", "cat", context());
		await phone.manager.writeUserDictToJson();

		const sync = async () => {
			await laptop.manager.reloadOtherDictsIfChanged();
			await laptop.manager.flush();
			await phone.manager.reloadOtherDictsIfChanged();
			await phone.manager.flush();
		};
		for (let round = 0; round < 3; round++) await sync();

		expect(Object.keys(readDevice(adapter, "maria", "desktop-0000aaaa")).sort()).toEqual(["hund", "katze"]);
		expect(Object.keys(readDevice(adapter, "maria", PHONE)).sort()).toEqual(["hund", "katze"]);

		const settled = [...adapter.files.values()].map((file) => file.mtime);
		await sync();
		expect([...adapter.files.values()].map((file) => file.mtime)).toEqual(settled);
	});

	it("do not cause a save when nothing changed", async () => {
		putDevice(adapter, { hund: word("known", "dog") }, "maria", PHONE);
		const { manager } = await makeManager(adapter);
		const saved = adapter.files.get(MINE)!.mtime;

		await manager.reloadOtherDictsIfChanged();
		await manager.flush();
		const restarted = await makeManager(adapter);
		await restarted.manager.flush();

		expect(adapter.files.get(MINE)!.mtime).toBe(saved);
	});
});

describe("this device's file when it can't be read", () => {
	// e.g. after editing it by hand and leaving a trailing comma
	const broken = '{ "format": 2, "words": { "hund": { "highlight": "known", } }';

	it("is reported, and everything else still loads", async () => {
		adapter.put(MINE, broken);
		putDevice(adapter, { katze: word("known", "cat") }, "peter");
		const { manager } = await makeManager(adapter);

		expect(manager.unreadableReason).not.toBeNull();
		expect(Notice.shown).toHaveLength(1);
		expect(Notice.shown[0]).toMatch(/can't be read/);
		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("is never overwritten", async () => {
		adapter.put(MINE, broken);
		const { manager } = await makeManager(adapter);

		manager.addNewDefinition("katze", "unknown", "cat", context());
		await manager.writeUserDictToJson();
		await manager.writeUserDictToJson();

		expect(adapter.files.get(MINE)!.data).toBe(broken);
		expect(Notice.shown.filter((n) => /not saved/.test(n))).toHaveLength(2);
		expect(Notice.shown.filter((n) => /can't be read \(/.test(n))).toHaveLength(1);
	});

	it("is picked up once it is fixed, keeping changes made meanwhile", async () => {
		adapter.put(MINE, broken);
		const { manager } = await makeManager(adapter);
		manager.addNewDefinition("katze", "unknown", "cat", context());
		await manager.writeUserDictToJson();

		putDevice(adapter, { hund: word("known", "dog") }); // fixed by hand
		await manager.writeUserDictToJson();

		expect(manager.unreadableReason).toBeNull();
		expect(Object.keys(readDevice(adapter)).sort()).toEqual(["hund", "katze"]);
		expect(Notice.shown.join("\n")).toMatch(/can be read again/);
	});

	it("is not overwritten when it breaks after loading", async () => {
		putDevice(adapter, { hund: word("unknown", "dog") });
		const { manager } = await makeManager(adapter);
		adapter.put(MINE, "{ broken");

		manager.addNewDefinition("katze", "unknown", "cat", context());
		await manager.writeUserDictToJson();

		expect(adapter.files.get(MINE)!.data).toBe("{ broken");
	});

	it("counts a format it doesn't know as unreadable", async () => {
		adapter.put(MINE, '{"format": 3, "words": {}}');
		const { manager } = await makeManager(adapter);
		await manager.writeUserDictToJson();
		expect(adapter.files.get(MINE)!.data).toBe('{"format": 3, "words": {}}');
		expect(Notice.shown[0]).toMatch(/newer version/);
	});

	it("treats an empty file as an empty dictionary", async () => {
		adapter.put(MINE, "");
		const { manager } = await makeManager(adapter);
		manager.addNewDefinition("katze", "unknown", "cat", context());
		await manager.writeUserDictToJson();
		expect(Object.keys(readDevice(adapter))).toEqual(["katze"]);
	});
});

describe("coworkers' dictionaries", () => {
	it("are named after their folder", async () => {
		putDevice(adapter, {});
		putDevice(adapter, { hund: word("known", "dog") }, "peter");
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("combine all of the coworker's devices", async () => {
		putDevice(adapter, {});
		putDevice(adapter, { hund: word("known", "dog") }, "peter", "desktop-11111111");
		putDevice(adapter, { katze: word("unknown", "cat") }, "peter", "mobile-22222222");
		const { manager } = await makeManager(adapter);

		expect(Object.keys(manager.otherDicts.peter).sort()).toEqual(["hund", "katze"]);
	});

	it("are reloaded when they change, added when new and dropped when removed", async () => {
		putDevice(adapter, {});
		putDevice(adapter, { hund: word("unknown", "dog") }, "peter");
		const { manager, plugin } = await makeManager(adapter);
		plugin.refreshHighlights.mockClear();

		await manager.reloadOtherDictsIfChanged();
		expect(plugin.refreshHighlights).not.toHaveBeenCalled();

		putDevice(adapter, { hund: word("known", "dog") }, "peter");
		putDevice(adapter, { katze: word("known", "cat") }, "anna");
		await manager.reloadOtherDictsIfChanged();
		expect(manager.otherDicts.peter.hund.highlight).toBe("known");
		expect(Object.keys(manager.otherDicts).sort()).toEqual(["anna", "peter"]);
		expect(plugin.refreshHighlights).toHaveBeenCalled();

		adapter.files.delete(deviceFile("anna"));
		await manager.reloadOtherDictsIfChanged();
		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("retry a file that failed to load", async () => {
		putDevice(adapter, {});
		adapter.put(deviceFile("peter"), "{ half-synced");
		const { manager } = await makeManager(adapter);
		expect(manager.otherDicts).toEqual({});

		const file = adapter.files.get(deviceFile("peter"))!;
		file.data = JSON.stringify({ format: 2, words: { hund: word("known", "dog") } }); // same mtime
		await manager.reloadOtherDictsIfChanged();
		expect(Object.keys(manager.otherDicts)).toEqual(["peter"]);
	});

	it("skip hidden folders, e.g. Syncthing's file versions", async () => {
		putDevice(adapter, {});
		adapter.put(`${FOLDER}/.stversions/peter.json`, {});
		const { manager } = await makeManager(adapter);
		expect(manager.otherDicts).toEqual({});
		expect(manager.listUsers()).toEqual(["maria"]);
	});
});

describe("users", () => {
	it("are listed from folders and older files, once each, without conflict copies", async () => {
		putDevice(adapter, {});
		adapter.put(`${FOLDER}/peter.json`, {});
		adapter.put(`${FOLDER}/anna.sync-conflict-20261125-143012-ABC1234.json`, {});
		adapter.folders.add(`${FOLDER}/zoe`);
		const { manager } = await makeManager(adapter);

		expect(manager.listUsers()).toEqual(["maria", "peter", "zoe"]);
	});

	it("can be created, and are then seen by other devices", async () => {
		const { manager } = await makeManager(adapter, "");
		await manager.createUser("Anna Maria");

		expect(readDevice(adapter, "Anna Maria")).toEqual({});
		const otherDevice = await makeManager(adapter, "", FOLDER, PHONE);
		expect(otherDevice.manager.listUsers()).toEqual(["Anna Maria"]);
	});
});

describe("switching user", () => {
	it("finishes saving the previous user's changes to their own file", async () => {
		putDevice(adapter, {});
		putDevice(adapter, { katze: word("known", "cat") }, "peter", PHONE);
		const { manager, plugin } = await makeManager(adapter);

		manager.addNewDefinition("hund", "unknown", "dog", context());
		manager.writeUserDictToJson(); // not awaited, like the sidebar's calls

		// what LangsoftPlugin.switchUser does
		await manager.flush();
		plugin.currentUser = "peter";
		await manager.init();

		expect(Object.keys(readDevice(adapter))).toEqual(["hund"]);
		expect(Object.keys(readDevice(adapter, "peter"))).toEqual(["katze"]);
		expect(Object.keys(manager.userDict)).toEqual(["katze"]);
		expect(Object.keys(manager.otherDicts)).toEqual(["maria"]);
	});
});

describe("deleting definitions", () => {
	it("records in the history when the last definition of a word is deleted", async () => {
		putDevice(adapter, { hund: { ...word("known", "dog"), definitions: { dog: context(), hound: context() } } });
		const { manager } = await makeManager(adapter);

		manager.markDefinitionDeleted("hund", "dog");
		expect(manager.userDict.hund.highlighthistory).toHaveLength(1);
		expect(manager.userDict.hund.highlight).toBe("known");

		manager.markDefinitionDeleted("hund", "hound");
		await manager.flush();
		expect(manager.userDict.hund.highlight).toBe("None");
		expect(manager.userDict.hund.highlighthistory.map((h) => h.level)).toEqual(["known", "None"]);
		expect(readDevice(adapter).hund.highlighthistory.at(-1).level).toBe("None");
	});
});

describe("editing and undoing", () => {
	it("renames a definition, keeping where it was added", async () => {
		putDevice(adapter, { hund: word("known", "dgo") });
		const { manager } = await makeManager(adapter);

		manager.renameDefinition("hund", "dgo", " Dog ");
		await manager.flush();

		const definitions = readDevice(adapter).hund.definitions;
		expect(definitions.dgo.deleted).toBe(true);
		expect(definitions.dog).toMatchObject({ deleted: false, sentence: "ein <u>Hund </u>bellt", file: "note.md" });
		expect(definitions.dog.timestamp > "2026-01-01 10:00:00").toBe(true);
		expect(manager.userDict.hund.highlight).toBe("known");
	});

	it("renaming to an existing definition just removes the old one", async () => {
		putDevice(adapter, { hund: { ...word("known", "dog"), definitions: { dog: context(), hound: context() } } });
		const { manager } = await makeManager(adapter);
		manager.renameDefinition("hund", "hound", "dog");
		expect(manager.userDict.hund.definitions.hound.deleted).toBe(true);
		expect(manager.userDict.hund.definitions.dog).toEqual(context());
	});

	it("ignores an empty or unchanged new text", async () => {
		putDevice(adapter, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);
		manager.renameDefinition("hund", "dog", "  ");
		manager.renameDefinition("hund", "dog", "DOG");
		expect(Object.keys(manager.userDict.hund.definitions)).toEqual(["dog"]);
	});

	it("undoes deleting the last definition, bringing back the level", async () => {
		putDevice(adapter, { hund: word("semiknown", "dog") });
		const { manager } = await makeManager(adapter);
		manager.markDefinitionDeleted("hund", "dog");
		expect(manager.userDict.hund.highlight).toBe("None");

		manager.restoreDefinition("hund", "dog", "semiknown");
		await manager.flush();
		expect(manager.userDict.hund.highlight).toBe("semiknown");
		expect(manager.userDict.hund.definitions.dog.deleted).toBe(false);
		expect(manager.userDict.hund.highlighthistory.map((h) => h.level)).toEqual(["semiknown", "None", "semiknown"]);
	});

	it("an undo wins against another device's copy of the deletion", async () => {
		putDevice(adapter, { hund: word("known", "dog") });
		const { manager } = await makeManager(adapter);
		manager.markDefinitionDeleted("hund", "dog");
		await manager.flush();
		const deleted = structuredClone(readDevice(adapter));

		manager.restoreDefinition("hund", "dog", "known");
		await manager.flush();
		// the phone still has the deletion
		putDevice(adapter, deleted, "maria", PHONE);
		await manager.reloadOtherDictsIfChanged();
		await manager.flush();
		expect(manager.userDict.hund.definitions.dog.deleted).toBe(false);
		expect(manager.userDict.hund.highlight).toBe("known");
	});
});
