import { describe, expect, it } from "vitest";
import { conflictOwner, dictionaryName, groupDictionaries, isSyncConflict, parseDictionary } from "../dictionary-files";

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
