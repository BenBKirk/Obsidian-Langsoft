import { describe, expect, it } from "vitest";
import { checkNewUserName } from "../users";

describe("checkNewUserName", () => {
	const existing = ["Maria", "peter"];

	it("accepts a normal name, trimmed", () => {
		expect(checkNewUserName("  Anna Smith ", existing)).toEqual({ name: "Anna Smith" });
		expect(checkNewUserName("José", existing)).toEqual({ name: "José" });
		expect(checkNewUserName("नेहा", existing)).toEqual({ name: "नेहा" });
	});

	it("rejects an empty name", () => {
		expect(checkNewUserName("   ", existing)).toHaveProperty("error");
	});

	it("rejects characters that can't be in a file name", () => {
		for (const bad of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a|b", "a#b", "a[b]", "a\nb"]) {
			expect(checkNewUserName(bad, existing), bad).toHaveProperty("error");
		}
	});

	it("rejects names that would be hidden, reserved or look like a conflict copy", () => {
		for (const bad of [".maria", "maria.", "CON", "nul", "com1", "maria.sync-conflict-1"]) {
			expect(checkNewUserName(bad, existing), bad).toHaveProperty("error");
		}
	});

	it("rejects very long names", () => {
		expect(checkNewUserName("x".repeat(51), existing)).toHaveProperty("error");
		expect(checkNewUserName("x".repeat(50), existing)).toEqual({ name: "x".repeat(50) });
	});

	it("rejects an existing name, ignoring case, and names the existing one", () => {
		expect(checkNewUserName("maria", existing)).toEqual({
			error: '"Maria" already exists. If that\'s you, choose it from the list.',
		});
		expect(checkNewUserName("PETER", existing)).toHaveProperty("error");
	});
});
