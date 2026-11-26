import { describe, expect, it } from "vitest";
import { teamGrowth, teamStats } from "../team";
import type { DictionaryData, WordEntry } from "../dictionaries";

/** A word with one definition and level changes at the given times. */
const word = (history: [string, string][], deleted = false): WordEntry => ({
	highlight: history.length ? history[history.length - 1][0] : "None",
	definitions: { meaning: { deleted, timestamp: history[0]?.[1] ?? "", sentence: "" } },
	highlighthistory: history.map(([level, timestamp]) => ({ level, timestamp })),
	firstwordofphrase: [],
});
const at = (level: string, date = "2026-10-01") => word([[level, `${date} 10:00:00`]]);

const NOW = new Date(2026, 10, 25, 12, 0, 0);

const me: DictionaryData = { hund: at("known"), katze: at("unknown"), weg: word([["known", "2026-10-01 10:00:00"]], true) };
const team = {
	dave: { hund: at("unknown"), maus: at("known"), vogel: at("unknown") },
	tabea: { hund: at("semiknown"), maus: at("unknown"), fisch: at("None") },
	jed: { katze: at("unknown"), maus: at("semiknown") },
};

describe("teamStats", () => {
	const stats = teamStats(me, team);

	it("counts the people, you included", () => {
		expect(stats.people).toBe(4);
	});

	it("counts the different words anyone has defined, and those someone knows", () => {
		// hund, katze, maus, vogel: weg is deleted and fisch has no level
		expect(stats.vocabulary).toBe(4);
		// hund (you), maus (Dave)
		expect(stats.knownBySomeone).toBe(2);
	});

	it("counts the words only your teammates have defined", () => {
		expect(stats.teammatesOnly).toBe(2); // maus, vogel
	});

	it("copes with missing dictionaries and entries", () => {
		expect(teamStats({}, { x: undefined as unknown as DictionaryData }).vocabulary).toBe(0);
	});
});

describe("teamGrowth", () => {
	it("follows the team's combined vocabulary over time", () => {
		const growth = teamGrowth(
			{ hund: at("unknown", "2026-09-10") },
			{
				dave: { hund: word([["unknown", "2026-09-01 10:00:00"], ["known", "2026-11-03 10:00:00"]]), maus: at("unknown", "2026-10-20") },
				tabea: { vogel: at("known", "2026-11-20") },
			},
			"month",
			NOW
		);
		// each point counts the changes before it, so the state on a day is at the next point after it
		const after = (y: number, m: number, d: number) => {
			const time = new Date(y, m, d).getTime();
			return growth.find((p) => p.time.getTime() > time)!;
		};
		expect(after(2026, 8, 3)).toMatchObject({ vocabulary: 1, knownBySomeone: 0 }); // hund (Dave)
		expect(after(2026, 9, 27)).toMatchObject({ vocabulary: 2, knownBySomeone: 0 }); // + maus
		expect(growth[growth.length - 1]).toMatchObject({ time: NOW, vocabulary: 3, knownBySomeone: 2 }); // + vogel; hund known by Dave
	});

	it("covers every year since the team's first change", () => {
		const growth = teamGrowth({}, { dave: { alt: at("known", "2024-05-01") } }, "year", NOW);
		expect(growth[0].time).toEqual(new Date(2024, 0, 1));
		expect(growth[growth.length - 1].vocabulary).toBe(1);
	});
});
