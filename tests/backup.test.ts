import { beforeEach, describe, expect, it } from "vitest";
import {
	backedUpToday,
	BackupInfo,
	backupsToKeep,
	decodeBackup,
	encodeBackup,
	listBackups,
	makeBackup,
	planRestore,
	userBackupFolder,
} from "../backup";
import { FakeAdapter, makeManager, putDevice, readDevice } from "./fake-vault";
import type { DictionaryData, WordEntry } from "../dictionaries";

const entry = (highlight: string, definitions: Record<string, boolean>, timestamp = "2026-01-01 10:00:00"): WordEntry => {
	const defs: WordEntry["definitions"] = {};
	for (const [d, deleted] of Object.entries(definitions)) defs[d] = { deleted, timestamp, sentence: `ein <u>${d} </u>satz`, file: "note.md" };
	return { highlight, definitions: defs, highlighthistory: [{ level: highlight, timestamp }], firstwordofphrase: [] };
};

describe("backup files", () => {
	it("round-trip, compressed", async () => {
		const words: DictionaryData = { "don’t": entry("known", { "do not": false }), hund: entry("unknown", { dog: false }) };
		const { data, extension } = await encodeBackup(words);
		expect(extension).toBe("json.gz");
		expect([data[0], data[1]]).toEqual([0x1f, 0x8b]);
		const decoded = await decodeBackup(data.slice().buffer);
		expect(decoded).toEqual({ words: { "don't": words["don’t"], hund: words.hund } });
	});

	it("read plain device files and old one-file dictionaries too", async () => {
		const words = { hund: entry("known", { dog: false }) };
		const device = new TextEncoder().encode(JSON.stringify({ format: 2, words }));
		const flat = new TextEncoder().encode(JSON.stringify(words));
		expect(await decodeBackup(device.buffer)).toEqual({ words });
		expect(await decodeBackup(flat.buffer)).toEqual({ words });
	});

	it("report a damaged or unknown file", async () => {
		expect(await decodeBackup(new TextEncoder().encode("{ broken").buffer)).toHaveProperty("error");
		expect(await decodeBackup(new Uint8Array([0x1f, 0x8b, 1, 2, 3]).buffer)).toHaveProperty("error");
		expect(await decodeBackup(new TextEncoder().encode('{"format": 9, "words": {}}').buffer)).toHaveProperty("error");
	});
});

describe("backupsToKeep", () => {
	const NOW = new Date(2026, 10, 27, 12, 0);
	const at = (daysAgo: number, hour = 9, size = 1000): BackupInfo => {
		const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour);
		return { path: `${daysAgo}-${hour}`, date, size };
	};

	it("keeps one a day for 14 days, one a week for 13 weeks, one a month for a year", () => {
		const daily = Array.from({ length: 400 }, (_, i) => at(i));
		const kept = backupsToKeep(daily, NOW);
		const days = kept.map((b) => Math.round((NOW.getTime() - b.date.getTime()) / 86400000));
		// the 14 newest days
		expect(days.slice(0, 14)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
		expect(kept.length).toBeGreaterThanOrEqual(25);
		expect(kept.length).toBeLessThanOrEqual(35);
		// nothing older than a year
		expect(Math.max(...days)).toBeLessThanOrEqual(366);
	});

	it("keeps only the newest of a day", () => {
		const kept = backupsToKeep([at(0, 9), at(0, 15), at(1, 9)], NOW);
		// the newest three are always kept
		expect(kept.map((b) => b.path)).toEqual(["0-15", "0-9", "1-9"]);
		const more = backupsToKeep([at(0, 9), at(0, 10), at(0, 11), at(0, 15), at(1, 9)], NOW);
		expect(more.map((b) => b.path)).toEqual(["0-15", "0-11", "0-10", "1-9"]);
	});

	it("drops the oldest when they take too much space, keeping the newest three", () => {
		const big = Array.from({ length: 10 }, (_, i) => at(i, 9, 10));
		expect(backupsToKeep(big, NOW, 45).map((b) => b.path)).toEqual(["0-9", "1-9", "2-9", "3-9"]);
		expect(backupsToKeep(big, NOW, 1)).toHaveLength(3);
	});
});

describe("making and listing backups", () => {
	let adapter: FakeAdapter;
	beforeEach(() => (adapter = new FakeAdapter()));

	it("saves, lists and prunes", async () => {
		const words = { hund: entry("known", { dog: false }) };
		const path = await makeBackup(adapter, "maria", words, new Date(2026, 10, 27, 14, 30));
		expect(path).toBe("Langsoft backups/maria/2026-11-27 1430.json.gz");
		const second = await makeBackup(adapter, "maria", words, new Date(2026, 10, 27, 14, 30));
		expect(second).toBe("Langsoft backups/maria/2026-11-27 1430 (2).json.gz");

		const list = await listBackups(adapter, "maria");
		expect(list.map((b) => b.path)).toContain(path);
		expect(backedUpToday(list, new Date(2026, 10, 27, 20))).toBe(true);
		expect(backedUpToday(list, new Date(2026, 10, 28, 8))).toBe(false);
		expect(await listBackups(adapter, "peter")).toEqual([]);
		expect(userBackupFolder("maria")).toBe("Langsoft backups/maria");
	});
});

describe("planRestore", () => {
	const backup: DictionaryData = {
		hund: entry("known", { dog: false, hound: false }),
		katze: entry("unknown", { cat: false }),
		maus: entry("semiknown", { mouse: false }),
		weg: entry("None", { gone: true }),
	};

	it("brings back what is missing and leaves the rest", () => {
		const current: DictionaryData = {
			hund: entry("unknown", { dog: false, hound: true, puppy: false }), // hound deleted since; level changed since
			katze: entry("None", { cat: true }), // deleted since
			// maus: gone completely
			vogel: entry("known", { bird: false }), // added since
		};
		const plan = planRestore(current, backup);
		expect(plan.map((i) => [i.term, i.wholeWord, i.level, i.definitions.map((d) => d.definition)])).toEqual([
			["hund", false, "known", ["hound"]],
			["katze", true, "unknown", ["cat"]],
			["maus", true, "semiknown", ["mouse"]],
		]);
	});

	it("has nothing to do when nothing is missing", () => {
		expect(planRestore(backup, backup)).toEqual([]);
	});
});

describe("restoring", () => {
	it("brings words back, keeps newer changes, and can be undone", async () => {
		const adapter = new FakeAdapter();
		putDevice(adapter, {
			hund: entry("unknown", { dog: false, hound: true }, "2026-02-01 10:00:00"),
			katze: entry("None", { cat: true }),
		});
		const { manager } = await makeManager(adapter);
		const plan = planRestore(manager.userDict, {
			hund: entry("known", { dog: false, hound: false }),
			katze: entry("unknown", { cat: false }),
			"auf jeden fall": entry("known", { "in any case": false }),
		});

		manager.applyRestore(plan);
		await manager.flush();
		const after = readDevice(adapter);
		expect(after.hund.highlight).toBe("unknown"); // the word still had a definition: its newer level stays
		expect(after.hund.definitions.hound.deleted).toBe(false);
		expect(after.katze.highlight).toBe("unknown");
		expect(after.katze.definitions.cat.sentence).toBe("ein <u>cat </u>satz");
		expect(after["auf jeden fall"].highlight).toBe("known");
		expect(after.auf.firstwordofphrase).toEqual(["auf jeden fall"]);

		manager.undoRestore(plan);
		await manager.flush();
		const undone = readDevice(adapter);
		expect(undone.hund.definitions.hound.deleted).toBe(true);
		expect(undone.hund.definitions.dog.deleted).toBe(false);
		expect(undone.katze.highlight).toBe("None");
		expect(undone["auf jeden fall"].highlight).toBe("None");
	});
});
