#!/bin/bash
# Patch Vibero's compiled omni.ja to bypass auth and use local AI endpoints
#
# Usage:
#   ./patch_omni.sh <path-to-original-vibero-dir>
#
# Example:
#   ./patch_omni.sh ~/Downloads/Vibero_win-x64
#
# This will:
#   1. Extract app/omni.ja from the original Vibero
#   2. Apply auth bypass + LLM + MinerU patches
#   3. Output patched omni.ja to app/staging/Zotero_win-x64/app/omni.ja
#
# Prerequisites:
#   - zip, unzip
#   - The patches/ directory (committed alongside this script)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHES_DIR="$SCRIPT_DIR/patches"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path-to-original-vibero-dir>"
    echo "Example: $0 /mnt/c/Users/you/Downloads/Vibero_win-x64"
    exit 1
fi

ORIG_DIR="$1"
ORIG_OMNI="$ORIG_DIR/app/omni.ja"

if [ ! -f "$ORIG_OMNI" ]; then
    echo "Error: $ORIG_OMNI not found"
    exit 1
fi

WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "Extracting original omni.ja..."
cd "$WORK_DIR"
unzip -q "$ORIG_OMNI"

echo "Applying patches..."

# 1. Auth bypass: vibeDBSync mock
cp "$PATCHES_DIR/vibeDBSync.js" chrome/content/zotero/xpcom/vibeDBSync.js

# 2. Auth bypass: vibeDBCloudSync mock
cp "$PATCHES_DIR/vibeDBCloudSync.js" chrome/content/zotero/xpcom/vibeDBCloudSync.js

# 3. Auth bypass: ZoteroHelper mock in ai-chat-iframe
cp "$PATCHES_DIR/ai-chat-iframe.html" chrome/content/zotero/ai-chat-iframe.html

# 4. LLM: redirect to user's own model config
cp "$PATCHES_DIR/llmapi.js" chrome/content/zotero/xpcom/pdfParsing/LLMApi/llmapi.js

# 5. LLM: article summary uses user's model
cp "$PATCHES_DIR/reader.js" chrome/content/zotero/xpcom/reader.js

# 6. MinerU: local mode + sanitized filenames
cp "$PATCHES_DIR/MinerU.js" chrome/content/zotero/xpcom/pdfParsing/MinerU/MinerU.js

# 7. Batch AI Summary menu item
cp "$PATCHES_DIR/zoteroPane.js" chrome/content/zotero/zoteroPane.js
cp "$PATCHES_DIR/zoteroPane.xhtml" chrome/content/zotero/zoteroPane.xhtml

# 8. Reader bundle: MAX_CONCURRENCY + timeout
cp "$PATCHES_DIR/reader_bundle.js" resource/reader/reader.js

echo "Repacking omni.ja..."
rm -f "$SCRIPT_DIR/omni_patched.ja"
zip -qr9XD "$SCRIPT_DIR/omni_patched.ja" *

echo ""
echo "Done! Patched omni.ja saved to: $SCRIPT_DIR/omni_patched.ja"
echo ""
echo "To deploy:"
echo "  cp omni_patched.ja <vibero-install>/app/omni.ja"
echo "  <vibero-install>/zotero.exe -purgecaches"
echo ""
echo "IMPORTANT: Do NOT overwrite the ROOT omni.ja (10MB) — only replace app/omni.ja (48MB)"
