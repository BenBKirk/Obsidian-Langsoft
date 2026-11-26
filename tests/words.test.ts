import { describe, expect, it } from "vitest";
import { buildSelectionContext, findWordAt, parseIntoWords, splitContext } from "../words";

const texts = (text: string) => parseIntoWords(text).map((w) => w.text);

describe("parseIntoWords", () => {
	it("returns each word with its position", () => {
		expect(parseIntoWords("Hello, world!")).toEqual([
			{ text: "Hello", from: 0, to: 5 },
			{ text: "world", from: 7, to: 12 },
		]);
	});

	it("shifts positions by the offset", () => {
		expect(parseIntoWords("ab cd", 10)).toEqual([
			{ text: "ab", from: 10, to: 12 },
			{ text: "cd", from: 13, to: 15 },
		]);
	});

	it("returns nothing for empty or word-less text", () => {
		expect(parseIntoWords("")).toEqual([]);
		expect(parseIntoWords(" ... -- !? ")).toEqual([]);
	});

	it("keeps apostrophes and hyphens inside a word", () => {
		expect(texts("don't stop, well-known mother-in-law")).toEqual(["don't", "stop", "well-known", "mother-in-law"]);
	});

	it("drops apostrophes and hyphens at the edges of a word", () => {
		expect(texts("the dogs' bowl -word- 'quoted'")).toEqual(["the", "dogs", "bowl", "word", "quoted"]);
	});

	it("splits on doubled separators", () => {
		expect(texts("a--b it''s")).toEqual(["a", "b", "it", "s"]);
	});

	it("handles letters from other scripts and digits", () => {
		expect(texts("Straße café Привет 日本語 ภาษาไทย room 101")).toEqual([
			"Straße",
			"café",
			"Привет",
			"日本語",
			"ภาษาไทย",
			"room",
			"101",
		]);
	});

	it("gives the same result when called repeatedly", () => {
		expect(texts("one two")).toEqual(texts("one two"));
	});

	// Known limitations, to be fixed. These are expected to fail until then.
	it.fails("keeps combining marks (Devanagari vowel signs) inside a word", () => {
		expect(texts("हिन्दी भाषा")).toEqual(["हिन्दी", "भाषा"]);
	});

	it.fails("keeps a decomposed accent inside a word", () => {
		expect(texts("café")).toEqual(["café"]);
	});

	it.fails("treats a typographic apostrophe like a straight one", () => {
		expect(texts("don’t")).toEqual(["don’t"]);
	});
});

describe("findWordAt", () => {
	const line = "hello  world";

	it("finds the word containing the position, including both ends", () => {
		expect(findWordAt(line, 0)?.text).toBe("hello");
		expect(findWordAt(line, 3)?.text).toBe("hello");
		expect(findWordAt(line, 5)?.text).toBe("hello");
		expect(findWordAt(line, 7)?.text).toBe("world");
		expect(findWordAt(line, 12)?.text).toBe("world");
	});

	it("returns null between words and outside the line", () => {
		expect(findWordAt(line, 6)).toBeNull();
		expect(findWordAt(line, 99)).toBeNull();
		expect(findWordAt("", 0)).toBeNull();
	});

	it("returns positions in the line", () => {
		expect(findWordAt("a well-known fact", 4)).toEqual({ text: "well-known", from: 2, to: 12 });
	});
});

describe("buildSelectionContext", () => {
	it("wraps the selection in <u> between the words around it", () => {
		const line = "the cat sat on the mat";
		const cursor = line.indexOf("sat") + "sat".length;
		expect(buildSelectionContext(line, cursor, "sat")).toBe("the cat  <u>sat </u> on the mat");
	});

	it("works at the start and end of a line", () => {
		expect(buildSelectionContext("word here", 4, "word")).toBe(" <u>word </u> here");
		expect(buildSelectionContext("here word", 9, "word")).toBe("here  <u>word </u>");
	});

	it("cuts long context and marks the cut with ...", () => {
		const before = Array.from({ length: 10 }, (_, i) => `b${i + 1}`).join(" ");
		const after = Array.from({ length: 10 }, (_, i) => `a${i + 1}`).join(" ");
		const line = `${before} target ${after}`;
		const cursor = line.indexOf("target") + "target".length;
		// the space next to the selection counts as one of the 7 context "words"
		expect(buildSelectionContext(line, cursor, "target")).toBe(
			"...b5 b6 b7 b8 b9 b10  <u>target </u> a1 a2 a3 a4 a5 a6..."
		);
	});

	it("uses the requested number of context words", () => {
		expect(buildSelectionContext("one two three X four five six", 15, "X", 2)).toBe("...three  <u>X </u> four...");
	});
});

describe("splitContext", () => {
	it("splits a context into the text before, the selection and the text after", () => {
		expect(splitContext("the cat  <u>sat </u> on the mat")).toEqual({
			before: "the cat  ",
			selection: "sat ",
			after: " on the mat",
		});
	});

	it("round-trips with buildSelectionContext", () => {
		const context = buildSelectionContext("a b c", 3, "b");
		const parts = splitContext(context);
		expect(parts && parts.before + "<u>" + parts.selection + "</u>" + parts.after).toBe(context);
	});

	it("keeps any other markup as plain text", () => {
		expect(splitContext('<img src=x onerror="alert(1)"> <u>word </u><b>x</b>')).toEqual({
			before: '<img src=x onerror="alert(1)"> ',
			selection: "word ",
			after: "<b>x</b>",
		});
	});

	it("returns null without markers", () => {
		expect(splitContext("plain text")).toBeNull();
		expect(splitContext("")).toBeNull();
		expect(splitContext("</u> backwards <u>")).toBeNull();
	});
});
