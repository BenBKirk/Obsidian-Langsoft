import { describe, expect, it } from "vitest";
import { findExamples } from "../examples";

describe("findExamples", () => {
	const note = "Tama loni se mosa'i.\nKalu tama Mosa’i ke!\n![[mosa'i rekaman.m4a]] [[Mosa'i catatan]] #mosai";

	it("finds every place, ignoring case and apostrophes, with the words around it", () => {
		const found = findExamples(note, "mosa'i", 2);
		expect(found.map((e) => [e.before, e.match, e.after])).toEqual([
			// punctuation stays, so sentence ends can be seen
			["…loni se", "mosa'i", ". Kalu tama…"],
			["…Kalu tama", "Mosa’i", "ke"],
		]);
		expect(note.slice(found[1].from, found[1].to)).toBe("Mosa’i");
	});

	it("leaves out links, recordings and tags", () => {
		expect(findExamples("![[mosa'i.m4a]] [[mosa'i]] #mosa", "mosa'i")).toEqual([]);
	});

	it("finds phrases as whole phrases", () => {
		expect(findExamples("tama loni se. loni tama", "tama loni").map((e) => e.match)).toEqual(["tama loni"]);
	});

	it("matches whole words only", () => {
		expect(findExamples("mosa'ina tama", "mosa'i")).toEqual([]);
		expect(findExamples("", "tama")).toEqual([]);
		expect(findExamples("tama", "")).toEqual([]);
	});

	it("marks cut-off context with …", () => {
		const [example] = findExamples("a b c d e tama f g h i j", "tama", 2);
		expect(example).toMatchObject({ before: "…d e", match: "tama", after: "f g…" });
		const [start] = findExamples("tama f", "tama", 2);
		expect(start).toMatchObject({ before: "", after: "f" });
	});
});
