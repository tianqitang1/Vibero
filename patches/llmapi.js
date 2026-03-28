/**
 * LLM API module - patched to use user's own configured model
 * Reads config from Zotero.Prefs 'aiChat.customModelConfigs' / 'aiChat.customModelConfigId'
 */

/**
 * Get the user's active AI model configuration from Zotero preferences
 * @returns {{ baseUrl: string, apiKey: string, model: string } | null}
 */
function _getUserLLMConfig() {
  try {
    // Try multiple ways to access Zotero prefs
    let Z = (typeof Zotero !== 'undefined') ? Zotero : null;
    if (!Z && typeof globalThis !== 'undefined' && globalThis.Zotero) Z = globalThis.Zotero;

    if (!Z || !Z.Prefs) {
      console.error('[llmapi] Zotero.Prefs not accessible');
      return null;
    }

    const configsJson = Z.Prefs.get('aiChat.customModelConfigs', true);
    const activeId = Z.Prefs.get('aiChat.customModelConfigId', true);
    console.log('[llmapi] Config found:', !!configsJson, 'activeId:', activeId);
    if (!configsJson) return null;
    const configs = JSON.parse(configsJson);
    if (!Array.isArray(configs) || configs.length === 0) return null;
    const active = activeId ? configs.find(c => c.id === activeId) : configs[0];
    const result = active || configs[0];
    // Normalize: the config may use 'modelName' instead of 'model'
    if (result && !result.model && result.modelName) {
      result.model = result.modelName;
    }
    console.log('[llmapi] Using model config:', result?.model, 'baseUrl:', result?.baseUrl);
    return result;
  } catch (e) {
    console.error('[llmapi] Failed to read user LLM config:', e);
    return null;
  }
}

/**
 * Format base URL into a chat completions endpoint
 */
function _formatEndpoint(baseUrl) {
  let url = (baseUrl || '').trim().replace(/\/+$/, '');
  // Strip existing path suffixes to avoid doubling
  url = url.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  // If already has /vN, just append /chat/completions
  if (/\/v\d+$/.test(url)) return url + '/chat/completions';
  // Otherwise add /v1/chat/completions
  return url + '/v1/chat/completions';
}

const API_CONFIG = { proxyUrl: '' }; // kept for compatibility, not used
const DEFAULT_MODEL = '';

const BATCH_SIZE = 60; // 每批处理多少个对象

/**
 * 调用火山引擎（豆包）API（通过 Cloudflare Worker 代理）
 * 注意：此函数专门用于火山引擎 Worker，不需要 X-API-Provider 请求头
 * 支持 response_format: json_schema 严格模式或 json_object 宽松模式
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数（包含 response_format）
 * @returns {Promise<Object>} API响应数据
 */
async function callHuoshanAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;

  // 获取 access_token (如果需要 JWT 验证)
  // 注意：在 XPCOM 环境下，Zotero 对象是全局可用的
  let token = null;
  if (typeof Zotero !== 'undefined' && Zotero.VibeDBSync) {
    token = await Zotero.VibeDBSync.getAccessToken();
    // 如果获取不到 token，且 ensureLoggedIn 可用，强制检查登录
    if (!token && Zotero.VibeDBSync.ensureLoggedIn) {
      if (!Zotero.VibeDBSync.ensureLoggedIn()) {
        throw new Error("用户未登录，请登录后重试");
      }
      // 登录面板打开后，重新获取一次（虽然通常需要用户操作后才会有）
      // 这里直接抛出错误让用户去登录比较合理
    }
  }

  // 构建请求体（火山引擎格式）
  const requestBody = {
    // model: options.model || "ep-20260116143400-qz6rl", // 火山引擎 endpoint ID
    model: DEFAULT_MODEL,
    stream: false, // 改为非流式传输
    temperature: options.temperature || 1.0,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens,
    thinking: {
      type: "disabled" // 火山引擎特有参数
    },
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  // 支持 response_format 选项（json_schema 严格模式或 json_object）
  if (options.response_format) {
    requestBody.response_format = options.response_format;
  } else {
    // 默认使用 json_object
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  // 如果有 token，添加到 Authorization 头
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到火山引擎 API (通过 Supabase 代理, 流式模式)...');
    // console.log('📝 请求消息:', message);
    // console.log(`[llmapi/callHuoshanAI] 发送请求, 模型: ${requestBody.model}, 是否流式(stream): ${requestBody.stream}`);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      // 检查 401 错误，触发重新登录
      if (response.status === 401 && typeof Zotero !== 'undefined' && Zotero.VibeDBSync) {
        console.log('[llmapi] Token 失效 (401)，触发重新登录流程');
        if (Zotero.VibeDBSync.clearUser) Zotero.VibeDBSync.clearUser();
        if (Zotero.VibeDBSync.ensureLoggedIn) Zotero.VibeDBSync.ensureLoggedIn();
        throw new Error("登录已过期，请在弹出的窗口中重新登录");
      }

      const errorText = await response.text();
      const responseHeaders = {};
      response.headers.forEach((val, key) => responseHeaders[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: responseHeaders,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    // 非流式响应处理
    // console.log('[llmapi/callHuoshanAI] 🚀 接口调用成功，开始等待非流式 JSON 返回...');
    const data = await response.json();

    // 打印 Token 消耗情况
    if (data.usage) {
      // console.log(`[llmapi/callHuoshanAI] 📊 Token 消耗统计 - prompt_tokens: ${data.usage.prompt_tokens || 0}, completion_tokens: ${data.usage.completion_tokens || 0}, total_tokens: ${data.usage.total_tokens || 0}`);
      if (typeof Zotero !== 'undefined') {
        if (!Zotero._vibeTokenCounter) Zotero._vibeTokenCounter = { prompt: 0, completion: 0, total: 0 };
        Zotero._vibeTokenCounter.prompt += data.usage.prompt_tokens || 0;
        Zotero._vibeTokenCounter.completion += data.usage.completion_tokens || 0;
        Zotero._vibeTokenCounter.total += data.usage.total_tokens || 0;
      }
    } else {

      // console.log('[llmapi/callHuoshanAI] 📊 未返回 Token 消耗统计 (usage 参数缺失)');
    }
    // console.log('[llmapi/callHuoshanAI] ✅ 收到非流式完整 JSON 响应');
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}


/**
 * 调用阿里云百炼（通义千问）API（通过 Supabase Edge Function 代理）
 * 使用 OpenAI Compatible 格式，支持 response_format: json_schema 严格模式或 json_object 宽松模式
 * 与 callHuoshanAI 完全对称，只是后端 url 不同，且不需要 thinking 参数
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数（包含 response_format）
 * @returns {Promise<Object>} API响应数据
 */
async function callBailianAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;

  // 获取 access_token（JWT 鉴权，与火山引擎逻辑一致）
  let token = null;
  if (typeof Zotero !== 'undefined' && Zotero.VibeDBSync) {
    token = await Zotero.VibeDBSync.getAccessToken();
    if (!token && Zotero.VibeDBSync.ensureLoggedIn) {
      if (!Zotero.VibeDBSync.ensureLoggedIn()) {
        throw new Error("用户未登录，请登录后重试");
      }
    }
  }

  // 构建请求体（OpenAI Compatible 格式，百炼不支持 thinking 参数）
  const requestBody = {
    model: options.model || 'qwen-plus-latest', // 百炼默认模型（与 Edge 代理默认一致）
    stream: false, // 改为非流式传输
    temperature: options.temperature || 1.0,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  // 支持 response_format 选项（json_schema 严格模式或 json_object）
  if (options.response_format) {
    requestBody.response_format = options.response_format;
  } else {
    // 默认使用 json_object
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  // 如果有 token，添加到 Authorization 头（用于 Supabase Edge Function 鉴权）
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log(`[llmapi/callBailianAI] 发送请求, 模型: ${requestBody.model}, 是否流式(stream): ${requestBody.stream}`);
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      // 检查 401 错误，触发重新登录
      if (response.status === 401 && typeof Zotero !== 'undefined' && Zotero.VibeDBSync) {
        console.log('[llmapi] Token 失效 (401)，触发重新登录流程');
        if (Zotero.VibeDBSync.clearUser) Zotero.VibeDBSync.clearUser();
        if (Zotero.VibeDBSync.ensureLoggedIn) Zotero.VibeDBSync.ensureLoggedIn();
        throw new Error("登录已过期，请在弹出的窗口中重新登录");
      }

      const errorText = await response.text();
      const responseHeaders = {};
      response.headers.forEach((val, key) => responseHeaders[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: responseHeaders,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    // 非流式响应处理
    // console.log('[llmapi/callBailianAI] 🚀 接口调用成功，开始等待非流式 JSON 返回...');
    const data = await response.json();

    // 打印 Token 消耗情况
    if (data.usage) {
      // console.log(`[llmapi/callBailianAI] 📊 Token 消耗统计 - prompt_tokens: ${data.usage.prompt_tokens || 0}, completion_tokens: ${data.usage.completion_tokens || 0}, total_tokens: ${data.usage.total_tokens || 0}`);
      if (typeof Zotero !== 'undefined') {
        if (!Zotero._vibeTokenCounter) Zotero._vibeTokenCounter = { prompt: 0, completion: 0, total: 0 };
        Zotero._vibeTokenCounter.prompt += data.usage.prompt_tokens || 0;
        Zotero._vibeTokenCounter.completion += data.usage.completion_tokens || 0;
        Zotero._vibeTokenCounter.total += data.usage.total_tokens || 0;
      }
    } else {

      // console.log('[llmapi/callBailianAI] 📊 未返回 Token 消耗统计 (usage 参数缺失)');
    }
    // console.log('[llmapi/callBailianAI] ✅ 收到非流式完整 JSON 响应');
    return data;

  } catch (error) {
    console.error('❌ [Bailian] API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}


/**
 * 调用 OpenRouter API（通过 Cloudflare Worker / Supabase Edge Function 代理）
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API响应数据
 */
async function callOpenRouterAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;
  // 更新为用户指定的 DeepSeek v3.2 (Chat Model)
  const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v3.2";

  // 构建请求体 (OpenAI Compatible)
  const requestBody = {
    model: options.model || DEFAULT_OPENROUTER_MODEL,
    model: options.model || DEFAULT_OPENROUTER_MODEL,
    stream: false, // 改为 false，避免 XPCOM 环境下流读取错误 (Error in input stream)
    // DeepSeek V3.2 是 Chat 模型，不需要处理 Thinking/Reasoning 标签
    temperature: options.temperature || 0.7,
    top_p: options.top_p || 0.9,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  // 支持 response_format 选项
  // OpenRouter 支持 json_schema (Structured Outputs)，不再强制降级为 json_object
  if (options.response_format) {
    // console.log('[callOpenRouterAI] 使用用户指定的 response_format:', options.response_format.type);
    requestBody.response_format = options.response_format;
  } else {
    // 默认使用 json_object
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到 OpenRouter API (通过 Supabase 代理, 非流式模式)...');
    // console.log('📝 请求消息:', message);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const headers = {};
      response.headers.forEach((val, key) => headers[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: headers,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    // 非流式模式：直接解析 JSON
    const data = await response.json();
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}

/**
 * 调用智谱AI API（通过 Cloudflare Worker 代理）
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API响应数据
 */
async function callZhipuAI(message = "", options = {}) {
  // Use user's own configured model instead of proxy
  const config = _getUserLLMConfig();
  if (!config || !config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('No AI model configured. Please configure your model in the AI Chat panel first (baseUrl, apiKey, model).');
  }

  const endpoint = _formatEndpoint(config.baseUrl);

  const requestBody = {
    model: config.model,
    stream: false,
    temperature: options.temperature || 1,
    top_p: options.top_p || 0.95,
    messages: [
      { role: "system", content: "You must respond with valid JSON only. No markdown, no extra text." },
      { role: "user", content: message }
    ]
  };

  // Disable reasoning/thinking — different APIs use different params
  // DashScope (qwen): enable_thinking: false (top-level boolean)
  // Volcengine (doubao/deepseek): thinking: { type: "disabled" }
  // For structured JSON extraction, reasoning is pure waste
  requestBody.enable_thinking = false;           // DashScope / Qwen format
  requestBody.thinking = { type: "disabled" };   // Volcengine / Anthropic format

  // Try with response_format if provided, otherwise try json_object
  if (options.response_format) {
    requestBody.response_format = options.response_format;
  } else {
    requestBody.response_format = { type: "json_object" };
  }

  // Verbose logging
  const promptPreview = message.length > 500 ? message.substring(0, 500) + `... [${message.length} chars total]` : message;
  console.log(`[llmapi] ➡️ REQUEST to ${config.model} at ${endpoint}`);
  console.log(`[llmapi]    thinking: ${JSON.stringify(requestBody.thinking || 'not set')}`);
  console.log(`[llmapi]    response_format: ${JSON.stringify(requestBody.response_format || 'not set')}`);
  console.log(`[llmapi]    temperature: ${requestBody.temperature}, top_p: ${requestBody.top_p}`);
  console.log(`[llmapi]    prompt: ${promptPreview}`);
  const t0 = Date.now();

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  // If response_format is not supported, retry without it
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[llmapi] ❌ HTTP ${response.status} after ${Date.now() - t0}ms: ${errorText.substring(0, 500)}`);
    if (errorText.includes('response_format') || errorText.includes('json_object') || errorText.includes('json_schema')) {
      console.warn('[llmapi] response_format not supported, retrying without it');
      delete requestBody.response_format;
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const retryError = await response.text();
        throw new Error(`LLM API error ${response.status}: ${retryError}`);
      }
    } else {
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }
  }

  const data = await response.json();
  const elapsed = Date.now() - t0;
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  const contentPreview = content.length > 500 ? content.substring(0, 500) + `... [${content.length} chars total]` : content;
  console.log(`[llmapi] ⬅️ RESPONSE in ${elapsed}ms`);
  console.log(`[llmapi]    tokens: prompt=${usage.prompt_tokens || '?'}, completion=${usage.completion_tokens || '?'}, total=${usage.total_tokens || '?'}`);
  if (usage.completion_tokens_details?.reasoning_tokens) {
    console.log(`[llmapi]    ⚠️ reasoning_tokens: ${usage.completion_tokens_details.reasoning_tokens} (thinking is ON — consider disabling)`);
  }
  console.log(`[llmapi]    content: ${contentPreview}`);
  return data;
}

/**
 * 调用 DeepSeek API（通过 Cloudflare Worker 代理）
 * @param {string} message - 用户消息
 * @param {Object} options - 可选参数
 * @returns {Promise<Object>} API响应数据
 */
async function callDeepseekAI(message = "你好，请介绍一下你自己", options = {}) {
  const url = API_CONFIG.proxyUrl;

  // 构建请求体
  const requestBody = {
    model: "deepseek-chat",
    stream: false,
    temperature: options.temperature || 1.0,
    top_p: options.top_p || 0.95,
    max_tokens: options.max_tokens,
    messages: [
    {
      role: "user",
      content: message
    }]

  };

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Provider': 'deepseek' // 指定使用 DeepSeek
    },
    body: JSON.stringify(requestBody)
  };

  try {
    // console.log('🚀 发送请求到 DeepSeek API (通过代理)...');
    // console.log('📝 请求消息:', message);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      const headers = {};
      response.headers.forEach((val, key) => headers[key] = val);

      const errorDetail = {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: headers,
        body: errorText
      };

      throw new Error(`HTTP错误完整详情:\n${JSON.stringify(errorDetail, null, 2)}`);
    }

    const data = await response.json();

    // console.log('✅ API调用成功!');
    // console.log('📊 响应数据:', JSON.stringify(data, null, 2));

    // 提取并显示AI回复内容
    if (data.choices && data.choices[0] && data.choices[0].message) {

      // console.log('🤖 AI回复:', data.choices[0].message.content);
    }
    return data;

  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    console.error('🔍 错误详情:', error);
    throw error;
  }
}

// XPCOM 环境下不使用 export，直接将函数暴露到全局作用域
// 这些函数会在 Services.scriptloader.loadSubScript 加载后自动可用