import { describe, expect, it } from "vitest";
import {
	classifyDictionaryPath,
	conflictOwner,
	dictionaryName,
	groupDictionaries,
	isSyncConflict,
	parseDeviceFile,
	parseDictionary,
	serializeDeviceFile,
} from "../dictionary-files";

describe("dictionaryName", () => {
	it("drops the folder and the .json extension", () => {
		expect(dictionaryName(".langsoft_dictionaries/maria.json")).toBe("maria");
		expect(dictionaryName("Some Folder/nested/Peter Smith.json")).toBe("Peter Smith");
		expect(dictionaryName("maria.json")).toBe("maria");
	});

	it("does not depend on the folder name's length", () => {
		// the old code cut a fixed 23 characters off the front of the path
		expect(dictionaryName("dicts/maria.json")).toBe("maria");
	});
});

describe("isSyncConflict / conflictOwner", () => {
	const conflict = ".langsoft_dictionaries/maria.sync-conflict-20261125-143012-ABC1234.json";

	it("recognises Syncthing conflict copies", () => {
		expect(isSyncConflict(conflict)).toBe(true);
		expect(conflictOwner(conflict)).toBe("maria");
	});

	it("leaves ordinary dictionaries alone", () => {
		expect(isSyncConflict(".langsoft_dictionaries/maria.json")).toBe(false);
		expect(isSyncConflict(".langsoft_dictionaries/sync-conflict.json")).toBe(false);
	});

	it("is not fooled by the folder name", () => {
		expect(isSyncConflict("x.sync-conflict-1/maria.json")).toBe(false);
	});
});

describe("parseDictionary", () => {
	it("reads a JSON object", () => {
		expect(parseDictionary('{"hund": {"highlight": "known"}}')).toEqual({ dict: { hund: { highlight: "known" } } });
	});

	it("treats an empty file as an empty dictionary", () => {
		expect(parseDictionary("")).toEqual({ dict: {} });
		expect(parseDictionary("  \n")).toEqual({ dict: {} });
	});

	it("reports invalid JSON", () => {
		expect(parseDictionary('{ "hund": { "highlight": "known", }')).toHaveProperty("error");
	});

	it("reports JSON that isn't an object", () => {
		for (const text of ["[]", "null", "42", '"text"']) {
			expect(parseDictionary(text), text).toEqual({ error: "it does not contain a JSON object" });
		}
	});
});

describe("groupDictionaries", () => {
	it("groups the files of each user across folders, in order", () => {
		const groups = groupDictionaries([
			"Langsoft/maria.json",
			"Langsoft/peter.json",
			".langsoft_dictionaries/maria.json",
			".langsoft_dictionaries/anna.json",
		]);
		expect([...groups.entries()]).toEqual([
			["maria", ["Langsoft/maria.json", ".langsoft_dictionaries/maria.json"]],
			["peter", ["Langsoft/peter.json"]],
			["anna", [".langsoft_dictionaries/anna.json"]],
		]);
	});

	it("leaves out conflict copies and other files", () => {
		const groups = groupDictionaries([
			"Langsoft/maria.sync-conflict-20261125-143012-ABC1234.json",
			"Langsoft/notes.txt",
			"Langsoft/.json",
		]);
		expect(groups.size).toBe(0);
	});
});

describe("classifyDictionaryPath", () => {
	const classify = (path: string) => classifyDictionaryPath(path, "Langsoft", ".langsoft_dictionaries");

	it("recognises device files in a user's folder", () => {
		expect(classify("Langsoft/maria/desktop-1a2b3c4d.json")).toEqual({
			path: "Langsoft/maria/desktop-1a2b3c4d.json",
			user: "maria",
			kind: "device",
			conflict: false,
		});
	});

	it("recognises the one-file-per-user layout and the old folder", () => {
		expect(classify("Langsoft/maria.json")).toMatchObject({ user: "maria", kind: "flat" });
		expect(classify(".langsoft_dictionaries/maria.json")).toMatchObject({ user: "maria", kind: "legacy" });
	});

	it("gives conflict copies to the user they belong to", () => {
		expect(classify("Langsoft/maria.sync-conflict-20261125-143012-ABC1234.json")).toMatchObject({
			user: "maria",
			kind: "flat",
			conflict: true,
		});
		expect(classify("Langsoft/maria/desktop-1.sync-conflict-20261125-143012-ABC1234.json")).toMatchObject({
			user: "maria",
			kind: "device",
			conflict: true,
		});
	});

	it("ignores anything else", () => {
		expect(classify("Langsoft/notes.txt")).toBeNull();
		expect(classify("Langsoft/maria/deeper/x.json")).toBeNull();
		expect(classify("Other/maria.json")).toBeNull();
		expect(classify("maria.json")).toBeNull();
		expect(classify("Langsoft/.json")).toBeNull();
	});

	it("works with a nested folder and without an old folder", () => {
		expect(classifyDictionaryPath("a/b/maria/phone.json", "a/b", null)).toMatchObject({ user: "maria", kind: "device" });
		expect(classifyDictionaryPath(".langsoft_dictionaries/maria.json", "Langsoft", null)).toBeNull();
	});
});

describe("device files", () => {
	it("round-trip", () => {
		const words = { hund: { highlight: "known" } };
		expect(parseDeviceFile(serializeDeviceFile(words))).toEqual({ dict: words });
	});

	it("treat an empty file as an empty dictionary", () => {
		expect(parseDeviceFile("")).toEqual({ dict: {} });
		expect(parseDeviceFile("{}")).toEqual({ dict: {} });
	});

	it("reject a format they don't know", () => {
		expect(parseDeviceFile('{"format": 3, "words": {}}')).toHaveProperty("error");
		expect(parseDeviceFile('{"hund": {"highlight": "known"}}')).toHaveProperty("error");
	});

	it("reject a missing word list", () => {
		expect(parseDeviceFile('{"format": 2}')).toHaveProperty("error");
		expect(parseDeviceFile('{"format": 2, "words": []}')).toHaveProperty("error");
	});
});
