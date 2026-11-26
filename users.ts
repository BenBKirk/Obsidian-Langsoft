// Rules for user names, with no Obsidian dependency so they can be unit tested.
import { groupDictionaries } from "dictionary-files";

/** Characters that can't be used in file names on some systems, or that Obsidian treats specially. */
const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|#^[\]\u0000-\u001f]/;
/** File names Windows reserves. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const MAX_LENGTH = 50;

/** The users that have a dictionary, given the dictionary file paths. */
export function usersFromDictionaries(paths: string[]): string[] {
	return [...groupDictionaries(paths).keys()].sort((a, b) => a.localeCompare(b));
}

/**
 * Check a name typed in for a new user. Returns the name to use (trimmed),
 * or a message saying what is wrong with it.
 */
export function checkNewUserName(input: string, existingUsers: string[]): { name: string } | { error: string } {
	const name = input.trim();
	if (name === "") {
		return { error: "Enter a name." };
	}
	if (FORBIDDEN_CHARACTERS.test(name)) {
		return { error: 'A name can\'t contain any of \\ / : * ? " < > | # ^ [ ]' };
	}
	if (name.startsWith(".") || name.endsWith(".")) {
		return { error: "A name can't start or end with a dot." };
	}
	if (RESERVED_NAMES.test(name) || /\.sync-conflict-/i.test(name)) {
		return { error: "That name can't be used for a file. Try another." };
	}
	if (name.length > MAX_LENGTH) {
		return { error: `Use at most ${MAX_LENGTH} characters.` };
	}
	// compare ignoring case: on Windows and macOS "Maria.json" and "maria.json" are the same file
	const existing = existingUsers.find((user) => user.toLowerCase() === name.toLowerCase());
	if (existing !== undefined) {
		return { error: `"${existing}" already exists. If that's you, choose it from the list.` };
	}
	return { name };
}
