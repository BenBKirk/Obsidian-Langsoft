# Langsoft

A language-learning plugin for [Obsidian](https://obsidian.md). Read and write in the language you are learning, and Langsoft highlights each word by how well you know it, keeps your definitions together with the sentence you found them in, and shows you what your coworkers have already learned.

## Features

- **Highlighting by familiarity.** Words are tinted *unknown* (red), *semi-known* (yellow) or *known* (green). Phrases of several words are underlined in the same colours. Colours can be changed or switched off in the settings.
- **Definer sidebar.** Select text, or Ctrl+click a word, to open it in the sidebar. There you can:
  - set how well you know it: Unknown, Semi-known or Known (keys 1, 2, 3 while the sidebar has focus, or the commands **Mark as unknown / semi-known / known**, which can be given hotkeys)
  - add definitions (type one and press Enter)
  - see each definition with the sentence, note and date it was added in, and go to that sentence
  - edit definitions, or delete them (with Undo)
  - add a coworker's definition to yours with **+ Add**
  - open phrases you've defined that start with the word
- **Phones and tablets.** Long-press a word to select it, and it opens in the Definer: on phones in a panel at the bottom of the note, on tablets in the sidebar. The command **Langsoft: Define selection** does the same for the selection or the word at the cursor, and can be added to the mobile toolbar.
- **Hover definitions.** Hover over a word you have defined to see its definitions.
- **Search words.** Run the command **Langsoft: Search words** and type a word, or the start of one, to find your words and phrases with it and their definitions. Paste a whole sentence to see every word and phrase from your dictionaries in it. Words only your coworkers have defined are included, with their definitions. In either search window, Tab switches between searching words and searching by meaning.
- **Search by meaning.** Run the command **Langsoft: Search definitions** and type part of a meaning, e.g. `dog`, to find every word defined with it, yours and your coworkers', with the sentence each was added in. Matching is by the beginnings of words, so `do` finds `dog` too. Choosing a result opens the word in the sidebar; **Go to sentence** opens the note it was added in, at the word, if that sentence is still there. The same link appears under each definition in the sidebar.
- **Progress.** Run the command **Langsoft: Show progress** to see how many of your words are known, semi-known and unknown, week by week, month by month or year by year, and how many reached each level or were added in each period. It also shows a growth curve, and a calendar of the days you worked on your words with your current and longest streak. With at least three people sharing dictionaries, a Team section shows figures about everyone together, never about one person: the team's combined vocabulary and how it has grown, and how many words your teammates have defined that you haven't.
- **How much of a note you know.** A bar at the bottom of each note shows how many different words it has, and what share of them you know, half know or don't know, in your highlight colours, and what share only your coworkers have defined, in blue. It can be switched off in the settings.
- **Shared dictionaries.** Dictionaries belonging to other people appear alongside yours. Words they have defined and you haven't are highlighted blue, and you can copy one of their definitions with a click.

## Setup

Dictionaries are kept in the folder `Langsoft` at the root of your vault, which is created automatically. Each person has a folder of their own, and each of their devices writes its own file in it:

```
Langsoft/
  maria/
    desktop-1a2b3c4d.json
    mobile-5e6f7a8b.json
  peter/
    desktop-9c0d1e2f.json
```

Your dictionary is all the files in your folder, merged together. A device only ever writes its own file, so two devices never write the same file and can't overwrite each other. Everyone else's dictionaries are read the same way, and are read-only. Obsidian doesn't show JSON files in its file explorer, so the folders look empty there; don't delete or rename them.

The first time Langsoft runs on a device, it asks **who you are**. Choose your name if your dictionary is already there, for example synced from another device, or create a new user. To change user later, use the user setting in Langsoft's settings, the command **Langsoft: Switch user**, or click your name in the status bar.

Who you are is remembered on each device separately, not in the plugin's settings file, so syncing a whole vault between people doesn't make everyone the same user.

On a new device, wait until your dictionaries have synced, then choose your name. Creating the same user again makes a second, empty dictionary that conflicts with the real one when it arrives.

To keep dictionaries in a different folder, change `dictionaryFolder` in `.obsidian/plugins/langsoft-plugin/data.json`.

### Sharing with coworkers

Share the `Langsoft` folder between everyone's vaults, e.g. with Syncthing or Obsidian Sync. Each device only ever writes its own file, so nobody's changes overwrite anyone else's. Coworkers' dictionaries are reloaded when you switch notes, including ones added while Obsidian is open.

### Updating from an older version

Older versions kept one file per person: `Langsoft/<name>.json` in 1.2, and `.langsoft_dictionaries/<name>.json`, a hidden folder, in 1.1 and earlier. Nothing needs doing in Obsidian:

- The first time the new version runs on a device, your old files are merged into that device's file.
- Coworkers' old files are read too, so teammates who haven't updated yet are still shown.
- If one of your devices is still on an older version, words it adds to an old file keep being merged in.
- Old files are never changed. **Keep them for now:** the dictionaries of people who haven't updated are only there.

**The whole team should update around the same time.** Versions before 1.3 don't look inside the per-person folders, so they only see the old files of people who've updated, which stop changing.

**If you share only the dictionary folder through Syncthing** (rather than the whole vault) and are coming from 1.1 or earlier, add `Langsoft` as a new Syncthing folder on every device, shared with the same people. Don't rename or move the old folder in Syncthing: Syncthing would see its files as deleted and delete them on everyone's devices.

### Using several devices

Use the same user on as many devices as you like. Each device has its own file, and changes from your other devices are merged in when you switch notes. When the same definition or level was changed on two devices, the most recent change wins. From version 1.8, changes are timestamped in UTC, so this works across time zones; changes saved by older versions have no time zone and are read in the local time of the device doing the merge.

If Syncthing ever made conflict copies of your dictionary (`...sync-conflict-....json`), for example with an older version, Langsoft merges their words in and shows a notice. Once you've checked nothing is missing, you can delete the copies.

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
| `definer-panel.ts` | The Definer: word, level, definitions |
| `definer.ts`, `definer-bottom-panel.ts` | Where the Definer is shown: the sidebar, or the bottom of the editor on phones |
| `settings.ts` | The settings tab |
| `search.ts`, `search-modal.ts` | Searching definitions, and the search window |
| `progress.ts`, `team.ts`, `progress-view.ts` | Progress and team statistics, and the progress page |
| `coverage.ts`, `coverage-panel.ts` | How much of a note you know, and the bar showing it |
| `locate.ts` | Finding the sentence a definition was added in |
| `time.ts` | Saving and comparing timestamps |
| `merge.ts` | Merging two versions of a dictionary |
| `dictionary-files.ts` | Dictionary file layouts, the device file format, and conflict copies |
| `user-modal.ts` | The "Who are you?" window |
| `users.ts` | Listing users and checking new user names |
| `words.ts` | Splitting text into words |

`words.ts`, `users.ts`, `search.ts`, `locate.ts`, `progress.ts`, `team.ts`, `coverage.ts`, `time.ts`, `merge.ts` and `dictionary-files.ts` don't depend on Obsidian. The tests in `tests/` cover them, and run `DictionaryManager` against an in-memory vault (`tests/fake-vault.ts`) with a stand-in for the `obsidian` module (`tests/obsidian-stub.ts`).

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
