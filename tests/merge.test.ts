import { describe, expect, it } from "vitest";
import { mergeDictionaries } from "../merge";
import type { Definition, DictionaryData, WordEntry } from "../dictionaries";

const def = (timestamp: string, deleted = false): Definition => ({
	deleted,
	timestamp,
	file: "note.md",
	sentence: "a <u>word </u>here",
});

const entry = (
	highlight: string,
	definitions: Record<string, Definition>,
	history: [string, string][] = [[highlight, "2026-01-01 10:00:00"]],
	firstwordofphrase: string[] = []
): WordEntry => ({
	highlight,
	definitions,
	highlighthistory: history.map(([level, timestamp]) => ({ level, timestamp })),
	firstwordofphrase,
});

describe("mergeDictionaries", () => {
	it("keeps words that only one side has", () => {
		const laptop: DictionaryData = { hund: entry("unknown", { dog: def("2026-01-01 10:00:00") }) };
		const phone: DictionaryData = { katze: entry("known", { cat: def("2026-01-01 11:00:00") }) };
		expect(Object.keys(mergeDictionaries(laptop, phone)).sort()).toEqual(["hund", "katze"]);
	});

	it("keeps definitions that only one side has", () => {
		const a = { hund: entry("unknown", { dog: def("2026-01-01 10:00:00") }) };
		const b = { hund: entry("unknown", { hound: def("2026-01-01 11:00:00") }) };
		expect(Object.keys(mergeDictionaries(a, b).hund.definitions).sort()).toEqual(["dog", "hound"]);
	});

	it("keeps a deletion of a definition the other side still has", () => {
		const before = { hund: entry("unknown", { dog: def("2026-01-01 10:00:00"), hound: def("2026-01-01 10:00:00") }) };
		const deletedHere = structuredClone(before);
		deletedHere.hund.definitions.dog.deleted = true;
		for (const merged of [mergeDictionaries(before, deletedHere), mergeDictionaries(deletedHere, before)]) {
			expect(merged.hund.definitions.dog.deleted).toBe(true);
			expect(merged.hund.definitions.hound.deleted).toBe(false);
		}
	});

	it("keeps a definition that was re-added after being deleted", () => {
		const deleted = { hund: entry("unknown", { dog: def("2026-01-01 10:00:00", true) }) };
		const readded = { hund: entry("unknown", { dog: def("2026-01-02 09:00:00") }) };
		expect(mergeDictionaries(deleted, readded).hund.definitions.dog.deleted).toBe(false);
		expect(mergeDictionaries(readded, deleted).hund.definitions.dog.deleted).toBe(false);
	});

	it("combines the highlight history and uses the latest level", () => {
		const a = { hund: entry("semiknown", { dog: def("2026-01-01 10:00:00") }, [
			["unknown", "2026-01-01 10:00:00"],
			["semiknown", "2026-01-03 10:00:00"],
		]) };
		const b = { hund: entry("known", { dog: def("2026-01-01 10:00:00") }, [
			["unknown", "2026-01-01 10:00:00"],
			["known", "2026-01-02 10:00:00"],
		]) };
		const merged = mergeDictionaries(a, b).hund;
		expect(merged.highlighthistory).toEqual([
			{ level: "unknown", timestamp: "2026-01-01 10:00:00" },
			{ level: "known", timestamp: "2026-01-02 10:00:00" },
			{ level: "semiknown", timestamp: "2026-01-03 10:00:00" },
		]);
		expect(merged.highlight).toBe("semiknown");
		expect(mergeDictionaries(b, a).hund.highlight).toBe("semiknown");
	});

	it("turns the highlight off when no definition is left", () => {
		const a = { hund: entry("None", { dog: def("2026-01-01 10:00:00", true) }) };
		const b = { hund: entry("known", { dog: def("2026-01-01 10:00:00") }) };
		expect(mergeDictionaries(a, b).hund.highlight).toBe("None");
	});

	it("keeps phrase references from both sides once", () => {
		const a = { the: entry("None", {}, [["None", "2026-01-01 10:00:00"]], ["the end"]) };
		const b = { the: entry("None", {}, [["None", "2026-01-01 10:00:00"]], ["the end", "the start"]) };
		const merged = mergeDictionaries(a, b).the;
		expect(merged.firstwordofphrase).toEqual(["the end", "the start"]);
		expect(merged.highlight).toBe("None");
	});

	it("is the identity when both sides are the same", () => {
		const a = {
			hund: entry("known", { dog: def("2026-01-01 10:00:00") }),
			the: entry("None", {}, [["None", "2026-01-01 10:00:00"]], ["the end"]),
		};
		expect(mergeDictionaries(a, structuredClone(a))).toEqual(a);
	});

	it("copes with entries missing fields", () => {
		const a = { hund: { highlight: "known", definitions: { dog: def("2026-01-01 10:00:00") } } as unknown as WordEntry };
		const b = { hund: entry("known", { dog: def("2026-01-01 10:00:00") }) };
		expect(mergeDictionaries(a, b).hund.highlight).toBe("known");
	});

	it("does not change its inputs", () => {
		const a = { hund: entry("unknown", { dog: def("2026-01-01 10:00:00") }) };
		const b = { hund: entry("known", { hound: def("2026-01-02 10:00:00") }, [["known", "2026-01-02 10:00:00"]]) };
		const copies = structuredClone([a, b]);
		const merged = mergeDictionaries(a, b);
		merged.hund.definitions.dog.deleted = true;
		expect([a, b]).toEqual(copies);
	});
});
