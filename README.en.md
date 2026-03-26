# Vibero

<p align="center">
  <strong>Language / 语言</strong><br>
  <a href="./README.md">简体中文</a> · <b>English</b>
</p>

An enhanced Zotero build for literature and reading workflows.

---

### Website

[**vibero.dev**](https://vibero.dev)

### Full installers

Latest offline packages on GitHub Release: **[vibero-latest](https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest)**

| Platform | Download |
|----------|----------|
| **macOS** | [Vibero-mac.zip](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-mac.zip) |
| **Windows (x64)** | [Vibero-win-x64.zip](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-win-x64.zip) |

### Feature roadmap

- [x] AI chat
- [x] Full-document summary
- [x] Collaborative code reading
- [ ] Paragraph summary
- [ ] Draggable chat UI
- [ ] …

---

## Local development

See the official [source code guide](https://www.zotero.org/support/dev/source_code) for dependencies and environment (Node, Firefox/XULRunner, etc.).

### `./app/scripts/build_and_run`

Build from source and launch Zotero from the staging directory (the script picks the right binary on macOS / Linux / Windows).

```bash
./app/scripts/build_and_run -r
```

- **`-r`**: Run a full JS build (`npm run build`, etc.) before launch; **use on first clone or when you change non-reader JS**.
- Without `-r`: Launch only (expects existing build artifacts).
- **`-b`**: `-ZoteroSkipBundledFiles`; **`-d`**: attach JS debugger (see script comments).
- Optional **`ZOTERO_PROFILE`**: profile directory to use.

### `./build_reader_dev.sh`

Builds only the **reader** `zotero` webpack target and copies output to `build/resource/reader/`—handy when iterating on the PDF reader UI instead of a full build; the script ends by running **`./app/scripts/build_and_run -r`**.

```bash
./build_reader_dev.sh
```

For **ai-chat** and other frontends, run `npm run build` in the relevant subfolder, or use **`./app/scripts/build_and_run -r`** for a full build.

The DeepWiki shell is in place; point it at your own DeepWiki proxy to use it.
