/**
 * AI Chat 面板文案：iframe 内 Zotero.ftl 往往拿不到 vibe 条目或仍为英文，故以内置表为准，
 * 按 Zotero.locale（或 navigator.language）在 zh / en 间切换。
 */

export function getZotero() {
    return window.Zotero || window.parent?.Zotero || window.top?.Zotero;
}

/** 是否使用中文 UI（优先 Zotero.locale，其次 navigator；皆无时默认 zh-CN，避免 iframe 取不到语言时整页英文） */
export function isZhLocale() {
    const Z = getZotero();
    const loc = (Z && Z.locale) || (typeof navigator !== 'undefined' ? navigator.language : '') || 'zh-CN';
    return String(loc).toLowerCase().startsWith('zh');
}

function interpolate(template, args) {
    if (!args || !template) return template;
    return template.replace(/\{\s*\$([a-zA-Z0-9_]+)\s*\}/g, (_, k) =>
        (args[k] != null ? String(args[k]) : ''));
}

const STR = {
    zh: {
        'general-cancel': '取消',
        'vibe-ai-chat-model-tier-advanced': '高级模型',
        'vibe-ai-chat-model-tier-advanced-pro-only-suffix': '（PRO及以上可使用）',
        'vibe-ai-chat-advanced-models-require-pro': '高级模型仅 PRO / Ultimate 活跃订阅可用，请升级套餐或改用标准模型。',
        'vibe-ai-chat-model-tier-standard': '标准模型',
        'vibe-ai-chat-model-chatgpt': 'ChatGPT',
        'vibe-ai-chat-model-grok': 'Grok',
        'vibe-ai-chat-model-gemini': 'Gemini',
        'vibe-ai-chat-model-kimi': 'Kimi',
        'vibe-ai-chat-model-minimax': 'MiniMax',
        'vibe-ai-chat-model-qwen': 'Qwen',
        'vibe-ai-chat-model-doubao': 'Doubao',
        'vibe-ai-chat-model-deepseek': 'DeepSeek',
        'vibe-ai-chat-model-zhipu': '智谱 GLM',
        'vibe-ai-chat-custom-model-named': '自定义模型（{ $modelName }）',
        'vibe-ai-chat-custom-model-fallback': '自定义模型',
        'vibe-ai-chat-manage-custom-models': '管理自定义模型',
        'vibe-ai-chat-custom-model-settings-title': '自定义模型设置',
        'vibe-ai-chat-saved-configurations': '已保存的配置',
        'vibe-ai-chat-add-configuration': '添加新配置',
        'vibe-ai-chat-api-base-url': 'API Base URL',
        'vibe-ai-chat-api-base-url-row-tooltip':
            '左侧选择 OpenAI 或 Anthropic 格式。OpenAI 兼容使用 Bearer；Anthropic 使用 x-api-key。OpenAI 可填根地址或 /v1；Anthropic 可填 https://api.anthropic.com 或完整 …/v1/messages。',
        'vibe-ai-chat-api-base-url-placeholder-openai': 'https://api.openai.com/v1',
        'vibe-ai-chat-api-base-url-placeholder-anthropic': 'https://api.anthropic.com',
        'vibe-ai-chat-api-format-label-openai': 'OpenAI格式',
        'vibe-ai-chat-api-format-label-anthropic': 'Anthropic格式',
        'vibe-ai-chat-api-key-shared': 'API Key',
        'vibe-ai-chat-api-key-tooltip': '两种格式共用此输入框：按所选格式填写对应服务商的密钥。',
        'vibe-ai-chat-api-key-placeholder': '粘贴服务商提供的 API Key',
        'vibe-ai-chat-model-name': '模型名称',
        'vibe-ai-chat-model-name-tooltip': '例如 gpt-4o、deepseek-chat 等，以服务商文档为准。',
        'vibe-ai-chat-model-name-placeholder': '如 gpt-4o',
        'vibe-ai-chat-config-updated': '配置已更新',
        'vibe-ai-chat-config-added': '配置已添加',
        'vibe-ai-chat-config-save-failed': '保存失败',
        'vibe-ai-chat-confirm-delete-title': '确认删除',
        'vibe-ai-chat-confirm-delete-body': '确定要删除配置「{ $name }」吗？',
        'vibe-ai-chat-config-deleted': '配置已删除',
        'vibe-ai-chat-button-update': '更新',
        'vibe-ai-chat-button-add': '添加',
        'vibe-ai-chat-button-close': '关闭',
        'vibe-ai-chat-button-delete': '删除',
        'vibe-ai-chat-unnamed': '未命名',
        'vibe-ai-chat-current-model-title': '当前模型：{ $model }',
        'vibe-ai-chat-prompt-configure-custom-first': '请先在模型菜单中打开「管理自定义模型」并添加、选择配置。',
        'vibe-ai-chat-text-only-model-badge': '纯文本模型（不支持附图）',
        'vibe-ai-chat-multimodal-not-supported':
            '「{ $model }」不支持带图片或多模态输入，请切换其他模型。'
    },
    en: {
        'general-cancel': 'Cancel',
        'vibe-ai-chat-model-tier-advanced': 'Advanced',
        'vibe-ai-chat-model-tier-advanced-pro-only-suffix': ' (PRO & Ultimate only)',
        'vibe-ai-chat-advanced-models-require-pro':
            'Advanced models require an active PRO or Ultimate plan. Upgrade or pick a Standard model.',
        'vibe-ai-chat-model-tier-standard': 'Standard',
        'vibe-ai-chat-model-chatgpt': 'ChatGPT',
        'vibe-ai-chat-model-grok': 'Grok',
        'vibe-ai-chat-model-gemini': 'Gemini ',
        'vibe-ai-chat-model-kimi': 'Kimi',
        'vibe-ai-chat-model-minimax': 'MiniMax',
        'vibe-ai-chat-model-qwen': 'Qwen',
        'vibe-ai-chat-model-doubao': 'Doubao ',
        'vibe-ai-chat-model-deepseek': 'DeepSeek',
        'vibe-ai-chat-model-zhipu': 'Zhipu GLM',
        'vibe-ai-chat-custom-model-named': 'Custom model ({ $modelName })',
        'vibe-ai-chat-custom-model-fallback': 'Custom model',
        'vibe-ai-chat-manage-custom-models': 'Manage Custom Models',
        'vibe-ai-chat-custom-model-settings-title': 'Custom Model Settings',
        'vibe-ai-chat-saved-configurations': 'Saved configurations',
        'vibe-ai-chat-add-configuration': 'Add configuration',
        'vibe-ai-chat-api-base-url': 'API Base URL',
        'vibe-ai-chat-api-base-url-row-tooltip':
            'Choose OpenAI-compatible or Anthropic on the left. OpenAI uses Bearer; Anthropic uses x-api-key. URL: OpenAI root or /v1; Anthropic e.g. https://api.anthropic.com or full …/v1/messages.',
        'vibe-ai-chat-api-base-url-placeholder-openai': 'https://api.openai.com/v1',
        'vibe-ai-chat-api-base-url-placeholder-anthropic': 'https://api.anthropic.com',
        'vibe-ai-chat-api-format-label-openai': 'OpenAI format',
        'vibe-ai-chat-api-format-label-anthropic': 'Anthropic format',
        'vibe-ai-chat-api-key-shared': 'API Key',
        'vibe-ai-chat-api-key-tooltip': 'One field for both formats: use the key for the provider you selected.',
        'vibe-ai-chat-api-key-placeholder': "Paste your provider's API key",
        'vibe-ai-chat-model-name': 'Model name',
        'vibe-ai-chat-model-name-tooltip': 'Examples: gpt-4o, deepseek-chat, etc. (see your provider docs).',
        'vibe-ai-chat-model-name-placeholder': 'e.g. gpt-4o',
        'vibe-ai-chat-config-updated': 'Configuration updated',
        'vibe-ai-chat-config-added': 'Configuration added',
        'vibe-ai-chat-config-save-failed': 'Failed to save',
        'vibe-ai-chat-confirm-delete-title': 'Remove configuration',
        'vibe-ai-chat-confirm-delete-body': 'Remove “{ $name }”? This cannot be undone.',
        'vibe-ai-chat-config-deleted': 'Configuration removed',
        'vibe-ai-chat-button-update': 'Update',
        'vibe-ai-chat-button-add': 'Add',
        'vibe-ai-chat-button-close': 'Close',
        'vibe-ai-chat-button-delete': 'Delete',
        'vibe-ai-chat-unnamed': 'Unnamed',
        'vibe-ai-chat-current-model-title': 'Current model: { $model }',
        'vibe-ai-chat-prompt-configure-custom-first':
            'Add and select a custom model under Manage Custom Models in the model menu.',
        'vibe-ai-chat-text-only-model-badge': 'Text-only model (no images)',
        'vibe-ai-chat-multimodal-not-supported':
            '{ $model } does not support images or multimodal input. Switch to other model.'
    }
};

/**
 * @param {string} id
 * @param {Record<string, string|number>|undefined} args
 * @param {string} [fallback]
 */
export function zoteroL10n(id, args, fallback) {
    const lang = isZhLocale() ? 'zh' : 'en';
    const table = STR[lang];
    const raw = table[id] ?? STR.en[id] ?? fallback ?? id;
    return interpolate(raw, args);
}

export function formatCustomModelLabel(modelName) {
    const name = (modelName || '').trim();
    if (name) {
        return zoteroL10n('vibe-ai-chat-custom-model-named', { modelName: name });
    }
    return zoteroL10n('vibe-ai-chat-custom-model-fallback');
}
