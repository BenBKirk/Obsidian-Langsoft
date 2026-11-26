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

The first time Langsoft runs on a device, it asks **who you are**. Choose your name if your dictionary is already there, for example synced from another device, or create a new user. To change user later, use the user setting in Langsoft's settings, the command **Langsoft: Switch user**, or click your name in the status bar.

Who you are is remembered on each device separately, not in the plugin's settings file, so syncing a whole vault between people doesn't make everyone the same user.

On a new device, wait until your dictionaries have synced, then choose your name. Creating the same user again makes a second, empty dictionary that conflicts with the real one when it arrives.

To keep dictionaries in a different folder, change `dictionaryFolder` in `.obsidian/plugins/langsoft-plugin/data.json`.

### Sharing with coworkers

Share the `.langsoft_dictionaries` folder between everyone's vaults, e.g. with Syncthing. Each person only ever writes to their own file, so people never overwrite each other. Coworkers' dictionaries are reloaded when you switch notes, including ones added while Obsidian is open.

### Using several devices

You can use the same dictionary on more than one device. Before saving, Langsoft checks whether another device changed the file since it was last read, and merges those changes in rather than overwriting them. Keep the devices in the same time zone: the most recent change to a definition or level wins, judged by its timestamp.

If two devices save before either has synced, Syncthing keeps one version and saves the other as `<name>.sync-conflict-....json`. Langsoft shows a notice when this happens to your dictionary and otherwise ignores the copy. Words added on the losing side are only in the copy for now.

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
| `merge.ts` | Merging two versions of a dictionary |
| `dictionary-files.ts` | Dictionary file names and Syncthing conflict copies |
| `user-modal.ts` | The "Who are you?" window |
| `users.ts` | Listing users and checking new user names |
| `words.ts` | Splitting text into words |

`words.ts`, `users.ts`, `merge.ts` and `dictionary-files.ts` don't depend on Obsidian. The tests in `tests/` cover them, and run `DictionaryManager` against an in-memory vault (`tests/fake-vault.ts`) with a stand-in for the `obsidian` module (`tests/obsidian-stub.ts`).

## Releasing

1. Bump the version, e.g. `npm version minor --no-git-tag-version`. This updates `package.json`, `manifest.json` and `versions.json`. To support a different minimum Obsidian version, change `minAppVersion` in `manifest.json` first.
2. Commit and merge the change into `main`.
3. Tag the merge with the bare version number (no `v`), then push the tag:

   ```bash
   git tag 1.2.0 && git push origin 1.2.0
   ```

The release workflow checks that the tag matches `manifest.json`, runs the tests, builds the plugin, and creates a **draft** GitHub release with `main.js`, `manifest.json` and `styles.css` attached. Edit its notes and publish it.

## License

[GPL-3.0](LICENSE)
