<div align="center">

<img src="./assets/vibero-logo.png" width="132" alt="Vibero logo"/>

# Vibero

**重新分配你的注意力 —— 读得更快，但也更深入** ✨📚

<p>
  <a href="https://github.com/chenyu-xjtu/Vibero/stargazers"><img src="https://img.shields.io/github/stars/chenyu-xjtu/Vibero?style=for-the-badge&logo=github&color=ffc107&label=Stars" alt="GitHub Stars"/></a>
  <a href="https://github.com/chenyu-xjtu/Vibero/network/members"><img src="https://img.shields.io/github/forks/chenyu-xjtu/Vibero?style=for-the-badge&logo=github&color=0891b2&label=Forks" alt="GitHub Forks"/></a>
  <a href="https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest"><img src="https://img.shields.io/badge/Release-vibero--latest-7c3aed?style=for-the-badge&logo=github" alt="Latest release tag"/></a>
</p>

<p>
  <a href="https://vibero.dev"><img src="https://img.shields.io/badge/website-vibero.dev-0f172a?style=for-the-badge" alt="🌐 官网 vibero.dev"/></a>
  <a href="https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest"><img src="https://img.shields.io/badge/download-GitHub_Release-2563eb?style=for-the-badge&logo=github" alt="⬇️ 下载安装包"/></a>
</p>

**简体中文** | [English](./README.en.md)

</div>

---

## ✨ 这是什么？

Vibero 是一款 **vibe-reading** 阅读增强：帮你把注意力拉回 paper，读得更快，也想得更深。

---

## 🌐 官网

👉 [**https://vibero.dev**](https://vibero.dev)

---

## 📦 下载完整安装包

离线安装包见 GitHub Release：**[vibero-latest](https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest)**

| 平台 | 安装包 |
|:---:|:---|
| 🍎 **macOS** | [**Vibero-mac.zip**](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-mac.zip) |
| 🪟 **Windows (x64)** | [**Vibero-win-x64.zip**](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-win-x64.zip) |

---

## 🗺️ 产品路线图（持续更新）

> 路线图会持续更新。⏳

### ✅ 已落地（当前版本可用）

- [x] 💬 **AI 对话**
- [x] 📄 **全文总结**
- [x] 🧑‍💻 **代码协同阅读**

### 🚧 规划中 / TODO

- [ ] 📌 **段落级总结**
- [ ] 🖱️ **对话面板拖拽与布局**
- [ ] ✨ **更多阅读向 AI 能力**

---

## 🛠️ 本地开发与运行

依赖与完整环境请参考官方 [源码说明](https://www.zotero.org/support/dev/source_code)（Node、Firefox/XULRunner 等）。

### `./app/scripts/build_and_run`

从源码构建并启动 staging 目录下的 Zotero（macOS / Linux / Windows 由脚本自动选择可执行文件）。

```bash
./app/scripts/build_and_run -r
```

- **`-r`** 🧱：先跑完整 JS 构建（`npm run build` 等）再启动；**首次克隆或改了非 reader 的 JS 时用**  
- 不加 `-r`：仅启动（需已有构建产物）  
- **`-b`**：`-ZoteroSkipBundledFiles`；**`-d`**：挂 JS 调试器（脚本内另有说明）  
- 可选环境变量 **`ZOTERO_PROFILE`**：指定要用的配置档  

### `./build_reader_dev.sh`

只构建 **reader** 的 `zotero` webpack 目标，并把产物复制到 `build/resource/reader/`，适合频繁改 PDF 阅读器前端时代替全量构建；脚本末尾会执行 **`./app/scripts/build_and_run -r`**。

```bash
./build_reader_dev.sh
```

修改 **ai-chat** 等其它前端时，一般在对应子目录执行 `npm run build`，或仍用 **`./app/scripts/build_and_run -r`** 走全量构建。

DeepWiki 相关框架已搭好，接上自己的 **DeepWiki proxy** 即可使用 🔗
