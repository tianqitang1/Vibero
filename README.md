# Vibero

<p align="center">
  <strong>语言 Language</strong><br>
  <b>简体中文</b> · <a href="./README.en.md">English</a>
</p>

基于 Zotero 的文献与阅读增强版本。

---

### 官网

[**vibero.dev**](https://vibero.dev)

### 下载完整安装包

软件安装包见 GitHub Release：**[vibero-latest](https://github.com/chenyu-xjtu/Vibero/releases/tag/vibero-latest)**

| 平台 | 安装包 |
|------|--------|
| **macOS** | [Vibero-mac.zip](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-mac.zip) |
| **Windows (x64)** | [Vibero-win-x64.zip](https://github.com/chenyu-xjtu/Vibero/releases/download/vibero-latest/Vibero-win-x64.zip) |

### 功能清单

- [x] AI 对话
- [x] 全文总结
- [x] 代码协同阅读
- [ ] 段落总结
- [ ] 对话拖拽
- [ ] …

---

## 本地开发与运行

依赖与完整环境请参考官方 [源码说明](https://www.zotero.org/support/dev/source_code)（Node、Firefox/XULRunner 等）。

### `./app/scripts/build_and_run`

从源码构建并启动 staging 目录下的 Zotero（macOS / Linux / Windows 由脚本自动选择可执行文件）。

```bash
./app/scripts/build_and_run -r
```

- **`-r`**：先跑完整 JS 构建（`npm run build` 等）再启动；**首次克隆或改了非 reader 的 JS 时用**。
- 不加 `-r`：仅启动（需已有构建产物）。
- **`-b`**：`-ZoteroSkipBundledFiles`；**`-d`**：挂 JS 调试器（脚本内另有说明）。
- 可选环境变量 **`ZOTERO_PROFILE`**：指定要用的配置档。

### `./build_reader_dev.sh`

只构建 **reader** 的 `zotero` webpack 目标，并把产物复制到 `build/resource/reader/`，适合频繁改 PDF 阅读器前端时代替全量构建；脚本末尾会执行 **`./app/scripts/build_and_run -r`**。

```bash
./build_reader_dev.sh
```

修改 **ai-chat** 等其它前端时，一般在对应子目录执行 `npm run build`，或仍用 **`./app/scripts/build_and_run -r`** 走全量构建。

deepwiki框架已经搭建好，接上自己的deepwiki proxy即可使用
