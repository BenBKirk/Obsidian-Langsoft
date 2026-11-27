// Highlighting in Reading view. segmentText decides what to highlight and
// has no Obsidian dependency, so it can be unit tested; highlightElement
// applies it to the rendered note.
import type { BookShelf, DictionaryData, WordEntry } from "dictionaries";
import { parseIntoWords, termKey } from "words";

export interface Segment {
	text: string;
	/** For a word: "known", "semiknown", "unknown" or "coworker"; undefined for plain text. */
	level?: string;
	/** The dictionary key of the word, for opening it in the Definer. */
	term?: string;
}

export interface Group {
	/** A phrase underline around these segments: e.g. "knownunderline" or "coworkerunderline". */
	underline?: string;
	/** The phrase's dictionary key. */
	phrase?: string;
	segments: Segment[];
}

const LEVELS = new Set(["known", "semiknown", "unknown"]);

function hasDefinition(entry: WordEntry | undefined): boolean {
	return Object.values(entry?.definitions ?? {}).some((d) => d && !d.deleted);
}

/**
 * Split text into plain text, highlighted words and underlined phrases,
 * by the same rules as the editor: your level for words in your
 * dictionary; "coworker" for words that aren't in it at all but a
 * coworker has with a level. Phrases (the longest one starting at a word)
 * are underlined the same way, within this piece of text.
 */
export function segmentText(text: string, own: DictionaryData, coworkers: BookShelf): Group[] {
	const words = parseIntoWords(text);
	const keys = words.map((w) => termKey(w.text));
	const others = Object.values(coworkers ?? {}).filter(Boolean);

	const wordLevel = (key: string): string | undefined => {
		const entry = own?.[key];
		if (entry) return LEVELS.has(entry.highlight) ? entry.highlight : undefined;
		return others.some((d) => d[key] && d[key].highlight !== "None") ? "coworker" : undefined;
	};

	/** The longest phrase starting at word i, with its underline, if any. */
	const phraseAt = (i: number): { length: number; underline: string; phrase: string } | null => {
		const candidates: { phrase: string; underline: string }[] = [];
		for (const phrase of own?.[keys[i]]?.firstwordofphrase ?? []) {
			const entry = own[phrase];
			if (entry && LEVELS.has(entry.highlight) && hasDefinition(entry)) candidates.push({ phrase, underline: `${entry.highlight}underline` });
		}
		for (const dict of others) {
			for (const phrase of dict[keys[i]]?.firstwordofphrase ?? []) {
				// as for single words: only phrases you don't have, that the coworker has a level for
				if (own?.[phrase] || !dict[phrase] || dict[phrase].highlight === "None") continue;
				candidates.push({ phrase, underline: "coworkerunderline" });
			}
		}
		let best: { length: number; underline: string; phrase: string } | null = null;
		for (const { phrase, underline } of candidates) {
			const parts = parseIntoWords(phrase).map((w) => termKey(w.text));
			if (parts.length < 2 || !parts.every((part, j) => keys[i + j] === part)) continue;
			if (!best || parts.length > best.length) best = { length: parts.length, underline, phrase };
		}
		return best;
	};

	const groups: Group[] = [];
	let position = 0;
	let plain: Group = { segments: [] };
	const flushPlain = () => {
		if (plain.segments.length > 0) groups.push(plain);
		plain = { segments: [] };
	};
	const addText = (group: Group, from: number, to: number) => {
		if (to > from) group.segments.push({ text: text.slice(from, to) });
	};
	const addWord = (group: Group, i: number) => {
		const level = wordLevel(keys[i]);
		group.segments.push({ text: words[i].text, level, term: level ? keys[i] : undefined });
	};

	for (let i = 0; i < words.length; ) {
		addText(plain, position, words[i].from);
		const phrase = phraseAt(i);
		if (phrase) {
			flushPlain();
			const group: Group = { underline: phrase.underline, phrase: phrase.phrase, segments: [] };
			for (let j = i; j < i + phrase.length; j++) {
				if (j > i) addText(group, words[j - 1].to, words[j].from);
				addWord(group, j);
			}
			groups.push(group);
			position = words[i + phrase.length - 1].to;
			i += phrase.length;
		} else {
			addWord(plain, i);
			position = words[i].to;
			i++;
		}
	}
	addText(plain, position, text.length);
	flushPlain();
	return groups;
}

/** Elements whose text isn't prose: code, maths, front matter and properties. */
const SKIP =
	"code, pre, .math, mjx-container, .frontmatter, .frontmatter-container, .metadata-container, .langsoft-rv, a.tag, .internal-embed, .media-embed, audio, video";

/** A link to a note shown by its name rather than other text: its words are a name, not text to read. */
function isNoteNameLink(element: Element | null): boolean {
	const link = element?.closest("a.internal-link");
	if (!link) return false;
	const target = (link.getAttribute("data-href") ?? "").replace(/\.md$/, "");
	const shown = (link.textContent ?? "").trim();
	return shown === target || shown === target.slice(target.lastIndexOf("/") + 1);
}

/**
 * Highlight the words in a rendered piece of a note, in place. Only text
 * that has something to highlight is touched.
 */
export function highlightElement(root: HTMLElement, own: DictionaryData, coworkers: BookShelf) {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.closest(SKIP) || isNoteNameLink(node.parentElement) || !node.nodeValue?.trim()
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);

	for (const node of nodes) {
		const groups = segmentText(node.nodeValue ?? "", own, coworkers);
		if (!groups.some((g) => g.underline || g.segments.some((s) => s.level))) continue;
		const fragment = createFragment();
		for (const group of groups) {
			let parent: HTMLElement | DocumentFragment = fragment;
			if (group.underline) {
				const phrase = createSpan({ cls: ["langsoft-rv", group.underline] });
				if (group.phrase) phrase.dataset.langsoftTerm = group.phrase;
				parent = fragment.appendChild(phrase);
			}
			for (const segment of group.segments) {
				if (!segment.level) {
					parent.appendText(segment.text);
					continue;
				}
				const span = createSpan({ cls: ["langsoft-rv", segment.level], text: segment.text });
				if (segment.term) span.dataset.langsoftTerm = segment.term;
				parent.appendChild(span);
			}
		}
		node.replaceWith(fragment);
	}
}
