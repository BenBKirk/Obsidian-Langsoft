// Team statistics: figures about everyone together, never about one person.
// No Obsidian dependency, so it can be unit tested.
import type { BookShelf, DictionaryData, WordEntry } from "dictionaries";
import {
	addPeriods,
	levelAt,
	PeriodKind,
	periodCount,
	periodStart,
	seriesTimes,
	Timeline,
	timelinesByTerm,
} from "progress";

/**
 * Team figures are only shown when at least this many people have a
 * dictionary. With two, the team's figures minus your own would be your
 * teammate's own figures.
 */
export const MIN_TEAM_SIZE = 3;

export interface TeamStats {
	/** People with a dictionary, you included. */
	people: number;
	/** Different words at least one person has defined. */
	vocabulary: number;
	/** Of those, words at least one person knows. */
	knownBySomeone: number;
	/** Words your teammates have defined and you haven't. */
	teammatesOnly: number;
	/** Words defined by at least half the team (and at least two people), most widely defined first. */
	shared: { term: string; people: number }[];
}

/** Whether a dictionary has a word with a live definition and a level. */
function defines(dict: DictionaryData | undefined, term: string): WordEntry | null {
	const entry = dict?.[term];
	if (!entry || entry.highlight === "None") return null;
	return Object.values(entry.definitions ?? {}).some((d) => d && !d.deleted) ? entry : null;
}

function everyone(own: DictionaryData, coworkers: BookShelf): DictionaryData[] {
	return [own ?? {}, ...Object.values(coworkers ?? {}).filter(Boolean)];
}

export function teamStats(own: DictionaryData, coworkers: BookShelf, sharedLimit = 20): TeamStats {
	const dictionaries = everyone(own, coworkers);
	const terms = new Set<string>();
	for (const dict of dictionaries) for (const term of Object.keys(dict)) terms.add(term);

	let vocabulary = 0;
	let knownBySomeone = 0;
	let teammatesOnly = 0;
	const shared: { term: string; people: number }[] = [];
	const half = Math.max(2, Math.ceil(dictionaries.length / 2));

	for (const term of terms) {
		const entries = dictionaries.map((dict) => defines(dict, term));
		const people = entries.filter(Boolean).length;
		if (people === 0) continue;
		vocabulary++;
		if (entries.some((entry) => entry?.highlight === "known")) knownBySomeone++;
		if (!entries[0]) teammatesOnly++;
		if (people >= half) shared.push({ term, people });
	}

	shared.sort((a, b) => b.people - a.people || a.term.localeCompare(b.term));
	return { people: dictionaries.length, vocabulary, knownBySomeone, teammatesOnly, shared: shared.slice(0, sharedLimit) };
}

export interface TeamGrowthPoint {
	time: Date;
	/** Different words defined by at least one person just before `time`. */
	vocabulary: number;
	/** Of those, words known by at least one person. */
	knownBySomeone: number;
}

/**
 * The team's combined vocabulary over time, over the same range as the
 * personal progress statistics, from the team's earliest change.
 */
export function teamGrowth(own: DictionaryData, coworkers: BookShelf, kind: PeriodKind, now = new Date()): TeamGrowthPoint[] {
	// every person's timeline for each word
	const byTerm = new Map<string, Timeline[]>();
	let firstTime = Infinity;
	for (const dict of everyone(own, coworkers)) {
		for (const [term, timeline] of timelinesByTerm(dict)) {
			byTerm.set(term, [...(byTerm.get(term) ?? []), timeline]);
			firstTime = Math.min(firstTime, timeline[0].time);
		}
	}

	const count = periodCount(firstTime, kind, now);
	const from = addPeriods(periodStart(now, kind), kind, -(count - 1));
	return seriesTimes(from, kind, now).map((time) => {
		const until = time === now ? now.getTime() + 1 : time.getTime();
		let vocabulary = 0;
		let knownBySomeone = 0;
		for (const timelines of byTerm.values()) {
			const levels = timelines.map((timeline) => levelAt(timeline, until));
			if (levels.some((level) => level !== null)) vocabulary++;
			if (levels.includes("known")) knownBySomeone++;
		}
		return { time, vocabulary, knownBySomeone };
	});
}
