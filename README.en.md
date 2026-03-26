<div align="center">

<img src="./assets/vibero-logo.png" width="132" alt="Vibero logo"/>

# Vibero

**Read papers, chat, and summarize — right inside Zotero** ✨📚

<p>
  <a href="https://github.com/chenyu-xjtu/Vibero/stargazers"><img src="https://img.shields.io/github/stars/chenyu-xjtu/Vibero?style=for-the-badge&logo=github&color=ffc107&label=Stars" alt="GitHub Stars"/></a>
  <a href="https://github.com/chenyu-xjtu/Vibero/network/members"><img src="https://img.shields.io/github/forks/chenyu-xjtu/Vibero?style=for-the-badge&logo=github&color=0891b2&label=Forks" alt="GitHub Forks"/></a>
  <a href="https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest"><img src="https://img.shields.io/badge/Release-vibero--latest-7c3aed?style=for-the-badge&logo=github" alt="Latest release tag"/></a>
</p>

<p>
  <a href="https://vibero.dev"><img src="https://img.shields.io/badge/website-vibero.dev-0f172a?style=for-the-badge" alt="🌐 Website"/></a>
  <a href="https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest"><img src="https://img.shields.io/badge/download-GitHub_Release-2563eb?style=for-the-badge&logo=github" alt="⬇️ Download"/></a>
</p>

<a href="./README.md">简体中文</a> | **English**

</div>

---

## ✨ What is this?

Vibero is a **Zotero-based** reading-focused build: **💬 chat**, **📝 summarization**, and **🧑‍💻 collaborative technical reading** without leaving your library.  
We treat it as a **long-term product** — the roadmap below evolves over time. **Issues / PRs / feedback are welcome** 🤝

---

## 🌐 Website

👉 [**vibero.dev**](https://vibero.dev)

---

## 📦 Full installers

Latest offline packages: **[vibero-latest](https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest)**

| Platform | Download |
|:---:|:---|
| 🍎 **macOS** | [**Vibero-mac.zip**](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-mac.zip) |
| 🪟 **Windows (x64)** | [**Vibero-win-x64.zip**](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-win-x64.zip) |

---

## 🗺️ Roadmap (living document)

> **Note:** This is **not a “feature ceiling”** — it’s **where we are** and **where we’re headed**.  
> Checked items are **available on mainline builds**; unchecked items are **planned / in design** and may be reprioritized ⏳

### ✅ Shipped (available now)

- [x] 💬 **AI chat** — ask and discuss in a literature-first workflow  
- [x] 📄 **Full-document summary** — long reads, faster takeaways  
- [x] 🧑‍💻 **Collaborative code reading** — better for technical PDFs & code-heavy papers  

### 🚧 Planned / TODO

- [ ] 📌 **Paragraph-level summaries** — finer grain, closer to how you read  
- [ ] 🖱️ **Draggable chat / layout** — more flexible windowing  
- [ ] ✨ **More reading-centric AI features** — continuously expanding…  

---

## 🛠️ Local development

See the official [source code guide](https://www.zotero.org/support/dev/source_code) for dependencies and environment (Node, Firefox/XULRunner, etc.).

### `./app/scripts/build_and_run`

Build from source and launch Zotero from the staging directory (the script picks the right binary on macOS / Linux / Windows).

```bash
./app/scripts/build_and_run -r
```

- **`-r`** 🧱: Run a full JS build (`npm run build`, etc.) before launch; **use on first clone or when you change non-reader JS**  
- Without `-r`: Launch only (expects existing build artifacts)  
- **`-b`**: `-ZoteroSkipBundledFiles`; **`-d`**: attach JS debugger (see script comments)  
- Optional **`ZOTERO_PROFILE`**: profile directory to use  

### `./build_reader_dev.sh`

Builds only the **reader** `zotero` webpack target and copies output to `build/resource/reader/`—handy when iterating on the PDF reader UI instead of a full build; the script ends by running **`./app/scripts/build_and_run -r`**.

```bash
./build_reader_dev.sh
```

For **ai-chat** and other frontends, run `npm run build` in the relevant subfolder, or use **`./app/scripts/build_and_run -r`** for a full build.

The DeepWiki shell is in place; wire up your own **DeepWiki proxy** to use it 🔗
