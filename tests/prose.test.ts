import { describe, expect, it } from "vitest";
import { maskNonProse } from "../prose";

/** The words left, for easy comparison. */
const left = (text: string, wholeNote = false) => maskNonProse(text, wholeNote).split(/\s+/).filter(Boolean).join(" ");

describe("maskNonProse", () => {
	it("keeps positions", () => {
		const text = "tama ![[Rec 1.m4a]] loni [[Note|se]] mosa'i #tag";
		const masked = maskNonProse(text);
		expect(masked).toHaveLength(text.length);
		expect(masked.indexOf("loni")).toBe(text.indexOf("loni"));
		expect(masked.indexOf("se")).toBe(text.indexOf("|se") + 1);
	});

	it("removes embedded recordings, images and notes", () => {
		expect(left("tama ![[Recording 20251023153012.m4a]] loni")).toBe("tama loni");
		expect(left("![[Sesi satu.mp3]]")).toBe("");
		expect(left("lihat ![foto](images/kebun.jpg) ini")).toBe("lihat ini");
	});

	it("keeps a link's shown text, not its target", () => {
		expect(left("[[2025-10-23 Mengenal orang|pak Yansen]] datang")).toBe("pak Yansen datang");
		expect(left("dari [[Proses 11 Bangun dapur]]")).toBe("dari");
		expect(left("[rekaman](audio/rekaman%20satu.mp3) ini")).toBe("rekaman ini");
	});

	it("removes web addresses, tags, HTML tags, comments and inline code", () => {
		expect(left("see https://example.com/page and www.example.com")).toBe("see and");
		expect(left("#tag kata #kata-kerja")).toBe("kata");
		expect(left("a#b stays")).toBe("a#b stays");
		expect(left('<audio src="file.mp3"></audio> <b>tebal</b>')).toBe("tebal");
		expect(left("ya %% a comment %% tidak")).toBe("ya tidak");
		expect(left("ya %% over\ntwo lines %% tidak")).toBe("ya tidak");
		expect(left("pakai `code here` saja")).toBe("pakai saja");
	});

	it("removes front matter and code blocks only for a whole note", () => {
		const note = "---\ntags: [satu]\n---\ntama\n```\nfunction loni()\n```\nmosa'i";
		expect(left(note, true)).toBe("tama mosa'i");
		expect(left("```\nnot closed\n", true)).toBe("");
		// part of a note: a "---" line isn't front matter
		expect(left("---\ntama\n---", false)).toBe("--- tama ---");
	});

	it("leaves ordinary text alone", () => {
		const text = "Der Hund bellt, don’t (really) [sic].";
		expect(maskNonProse(text, true)).toBe(text);
	});
});
