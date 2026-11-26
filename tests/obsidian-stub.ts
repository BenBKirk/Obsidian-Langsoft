// A stand-in for the parts of the "obsidian" module the tested code uses.
// The real module only exists inside the Obsidian app.
import moment from "moment";

export { moment };

export function normalizePath(path: string): string {
	return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

/** Records every notice shown, so tests can check them. */
export class Notice {
	static shown: string[] = [];
	constructor(message: string) {
		Notice.shown.push(message);
	}
}
