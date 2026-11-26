# Langsoft

A language-learning plugin for [Obsidian](https://obsidian.md). Read and write in the language you are learning, and Langsoft highlights each word by how well you know it, keeps your definitions together with the sentence you found them in, and shows you what your coworkers have already learned.

## Features

- **Highlighting by familiarity.** Words are tinted *unknown* (red), *semi-known* (yellow) or *known* (green). Phrases of several words are underlined in the same colours. Colours can be changed or switched off in the settings.
- **Definer sidebar.** Select text, or Ctrl+click a word, to open it in the sidebar. There you can:
  - set how well you know it with the three buttons: plane taking off = unknown, plane = semi-known, rocket = known
  - add definitions (type one and press Enter)
  - see each definition with the sentence, note and date it was added in
  - delete definitions
- **Hover definitions.** Hover over a word you have defined to see its definitions.
- **Shared dictionaries.** Dictionaries belonging to other people appear alongside yours. Words they have defined and you haven't are highlighted blue, and you can copy one of their definitions with a click.

## Setup

Dictionaries are JSON files in the folder `.langsoft_dictionaries` at the root of your vault, one per person: `<name>.json`. The folder is created automatically. Your own dictionary is the one matching your user name. Everyone else's are read-only.

Choosing a user can't be done from the settings yet. Until it can:

1. Enable the plugin, then open and close its settings tab once. This creates `.obsidian/plugins/langsoft-plugin/data.json`.
2. In that file, set `"currentUser"` to your name, e.g. `"currentUser": "maria"`.
3. Create `.langsoft_dictionaries/maria.json` containing `{}`.
4. Reload Obsidian.

Leave `dictionaryFolder` at its default for now: other folder names don't work yet.

### Sharing with coworkers

Share the `.langsoft_dictionaries` folder between everyone's vaults, e.g. with Syncthing. Each person only ever writes to their own file, so people never overwrite each other. **Use one device per person for now.** If the same dictionary is open on two devices, changes made on one can be overwritten by the other.

## Installing

The plugin isn't in the community plugin list. To install it by hand, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/langsoft-plugin/`, then enable **Langsoft** under *Settings → Community plugins*.

## Development

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev        # rebuild main.js whenever a file changes
npm run build      # type check and production build
npm test           # run the tests (npm run test:watch to keep them running)
```

For quick testing, clone the repository into `<vault>/.obsidian/plugins/langsoft-plugin/` (or symlink the built files there), run `npm run dev`, and reload Obsidian after changes.

| File | Contents |
|---|---|
| `main.ts` | Plugin entry point: editor extensions, hover tooltips, selection handling, styles |
| `highlighter.ts` | CodeMirror plugins that highlight words, phrases and the current selection |
| `dictionaries.ts` | Loading, changing and saving dictionaries |
| `definer.ts` | The Definer sidebar |
| `settings.ts` | The settings tab |
| `words.ts` | Splitting text into words (no Obsidian dependency, unit tested in `tests/`) |

## License

[GPL-3.0](LICENSE)
