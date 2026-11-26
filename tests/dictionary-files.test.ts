import { describe, expect, it } from "vitest";
import { conflictOwner, dictionaryName, isSyncConflict } from "../dictionary-files";

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
