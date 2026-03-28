# Vibero Build Notes (WSL2 Handoff)

## Goal
Build Vibero from source so the "Generate Summary & Translation" button uses YOUR OWN AI endpoint/API key instead of requiring a Vibero account.

## Why this works
The open-source code has **mock auth stubs** that bypass all account/subscription checks:
- `chrome/content/zotero/xpcom/paperAiDB.js` — `VibeDBSync` mocked with unlimited credits, always-logged-in
- `chrome/content/zotero/ai-chat-iframe.html` — `ZoteroHelper` mocked with `checkLoginStatus: () => true`
- The compiled/distributed version replaces these stubs with real auth that gates features behind their account system

## What's already done
1. Git submodules initialized (`git submodule update --init --recursive`)
2. Root `npm install` completed
3. `ai-chat/npm install` completed
4. **ai-chat built successfully** — two placeholder icons were created:
   - `ai-chat/icons/@content.png` (1x1 transparent PNG)
   - `ai-chat/icons/love_message.svg` (empty SVG)
5. XULRunner for Windows x64 fetched to `app/xulrunner/`
6. Main JS build (`npm run build`) completed with one non-critical error (Monaco editor tsWorker.js Babel issue — ignorable)

## What failed on Windows
`app/scripts/dir_build` failed because `prepare_build` (Python) calls `rsync` which isn't available natively on Windows. The entire packaging pipeline (`prepare_build` → `dir_build` → `build.sh`) is designed for Linux/macOS.

## Steps to complete in WSL2

```bash
# Navigate to the repo (adjust path for WSL mount)
cd /mnt/c/Users/doras/Documents/github/Vibero

# May need to re-run npm install under WSL (node_modules may have platform-specific binaries)
npm install
cd ai-chat && npm install && npm run build && cd ..

# Build the JS layer
NODE_OPTIONS=--openssl-legacy-provider npm run build

# Fetch XULRunner for Windows (if not reusing the one already fetched)
app/scripts/fetch_xulrunner -p w -a x64

# Assemble staging directory
app/scripts/dir_build -q -p w -a x64

# Package the Windows binary
app/build.sh -p w -a x64 -s   # -s = don't zip, just build in staging/

# Output will be in app/staging/Zotero_win-x64/ (or similar)
```

## Key AI-related source files
- `ai-chat/src/customOpenAIService.js` — OpenAI-compatible API calls
- `ai-chat/src/customAnthropicService.js` — Anthropic API calls
- `ai-chat/src/index.jsx` — main chat logic, service routing
- `ai-chat/src/SlateInputWithSender.jsx` — config UI & model management
- `chrome/content/zotero/xpcom/reader.js` — paper summary feature (uses user-configured endpoint)
- `chrome/content/zotero/xpcom/paperAiDB.js` — mock auth/subscription (VibeDBSync)
- `chrome/content/zotero/ai-chat-iframe.html` — mock ZoteroHelper

## Alternative: Patch compiled version directly
If building is too much hassle, the compiled Vibero at `C:\Users\doras\Downloads\Vibero_win-x64\` can potentially be patched by finding and modifying the JS files inside its `app/` or omni.ja archive. The auth checks are just JavaScript.
