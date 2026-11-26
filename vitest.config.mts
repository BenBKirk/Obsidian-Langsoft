import { defineConfig } from "vitest/config";

const root = decodeURIComponent(new URL(".", import.meta.url).pathname);

export default defineConfig({
	resolve: {
		alias: [
			// the real "obsidian" package only contains type definitions; tests use a small stand-in
			{ find: /^obsidian$/, replacement: `${root}tests/obsidian-stub.ts` },
			// the source files import each other by bare name ("dictionaries"), resolved via tsconfig's baseUrl
			{ find: /^(main|words|definer-panel|search|search-modal|users|user-modal|dictionaries|dictionary-files|merge|highlighter|settings|definer)$/, replacement: `${root}$1.ts` },
		],
	},
});
