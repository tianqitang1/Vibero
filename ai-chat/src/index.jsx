
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Bubble } from '@ant-design/x';
import { Button, Flex, message as antMessage, Space, Spin, Modal } from 'antd';
import { LoadingOutlined, FontSizeOutlined } from '@ant-design/icons';
import contextTagPng from '../icons/@content.png';
import loveMessageSvg from '../icons/love_message.svg';
import atIconSvg from '../icons/at.svg';
import viberoIconPng from '../icons/vibero.png';
import SlateInputWithSender from './SlateInputWithSender';
import customOpenAIService from './customOpenAIService';
import customAnthropicService from './customAnthropicService';
import { MULTIMODAL_UNSUPPORTED_CODE } from './multimodalApiError';
import {
    buildChatHardFailureBubbleContent,
    buildChatHardFailureToastContent,
} from './chatHardFailureContent';
import { formatCustomModelLabel, zoteroL10n } from './zoteroL10n';
import MarkdownRenderer from './MarkdownRenderer';
import ChatImageLightbox from './ChatImageLightbox';
import './styles.css';

/** 附图仅 data URL（存 VibeDB 的 images[].base64） */
function chatImageDataUrl(img) {
    return img && typeof img.base64 === 'string' && img.base64 ? img.base64 : '';
}

/** 挂载后再读一次 Prefs，避免首帧 parent.Zotero 未就绪 */
function resolveInitialCustomModel() {
    try {
        const Z = typeof window !== 'undefined' ? (window.parent?.Zotero || window.Zotero) : null;
        if (!Z?.Prefs) {
            return { key: 'custom', label: zoteroL10n('vibe-ai-chat-custom-model-fallback'), configId: null };
        }
        let id = Z.Prefs.get('aiChat.customModelConfigId', true) || null;
        const saved = Z.Prefs.get('aiChat.customModelConfigs', true);
        let cfg = null;
        if (saved) {
            const arr = JSON.parse(saved);
            if (Array.isArray(arr) && arr.length > 0) {
                cfg = id ? arr.find(c => c.id === id) : null;
                if (!cfg) cfg = arr[0];
                if (!id && cfg.id) id = cfg.id;
            }
        }
        if (!cfg) {
            const oldSingle = Z.Prefs.get('aiChat.customModelConfig', true);
            if (oldSingle) {
                try {
                    cfg = JSON.parse(oldSingle);
                    id = id || 'legacy';
                } catch (_) { /* ignore */ }
            }
        }
        if (cfg) {
            return {
                key: 'custom',
                label: formatCustomModelLabel(cfg.modelName || cfg.name),
                configId: cfg.id || id,
            };
        }
        return { key: 'custom', label: zoteroL10n('vibe-ai-chat-custom-model-fallback'), configId: null };
    } catch (_) {
        return { key: 'custom', label: zoteroL10n('vibe-ai-chat-custom-model-fallback'), configId: null };
    }
}

const NO_PAPER_CONTEXT_MSG =
    '无法获取 PDF 正文（Markdown/文字层）。请使用可选中文字的 PDF，或在阅读器中提取文字后再试。';

/** 系统提示：明确 $ / $$ 与禁止裸 LaTeX，减少 KaTeX 无法解析或未被 remark-math 识别的输出 */
const VIBERO_AI_SYSTEM_PROMPT = `你是 Vibero 的 AI 助手，专门帮助用户阅读和理解学术论文。请用简洁、专业的语言回答问题。

格式要求：
1. 使用 Markdown 格式输出。
2. 数学公式必须用分隔符包裹才能渲染；禁止在正文里裸写 LaTeX（错误示例：直接写 \\mathbf{x} 或 T_i \\in \\mathrm{SE}(3) 而不加美元符分隔）。
   - 行内：用单个美元符包裹，如 $\\mathbf{p}_i$、$w_k$。
   - 块级：独占一行时用双美元符包裹整段，例如 $$\\sum_{k=1}^K w_k\\,\\mathcal{N}(\\mathbf{x};\\boldsymbol{\\mu}_k,\\boldsymbol{\\Sigma}_k)$$
   - 也可使用 \\(...\\) 作行内、\\[...\\] 作块级。
3. LaTeX 须语法正确：花括号与命令须配对（如 \\mathbf{x} 不可写成 \\mathbf}）；优先使用常见命令（\\mathbf、\\boldsymbol、\\mathrm、\\mathcal、\\frac 等）。
4. 多行复杂公式可使用 \`\`\`math 围栏代码块。
5. 普通代码使用 \`\`\`语言名 围栏。`;

// Vibero Logo
const viberoLogo = (
    <img src={viberoIconPng} width="40" height="40" alt="Vibero Logo" />
);

// 定义 roles 配置
const roles = {
    assistant: {
        placement: 'start',
        variant: 'shadow',
        loadingRender: () => (
            <Space>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 20, color: 'var(--fill-primary)' }} spin />} size="small" />
            </Space>
        ),
    },
    user: {
        placement: 'end',
        variant: 'shadow',
    },
};

function AIChatApp() {
    // 消息状态（不包含欢迎消息）
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [welcomeActionText, setWelcomeActionText] = useState('🤫 Sometimes AI has a surprise note for you. Take a peek!');
    const [loveActive, setLoveActive] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [draggedVibeCardId, setDraggedVibeCardId] = useState(null);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null); // 消息列表滚动容器，用于判断是否接近底部
    const insertVibeCardRef = useRef(null);

    // 字体大小调整状态
    const [fontScale, setFontScale] = useState(() => {
        // 从 Zotero Prefs 读取保存的字体大小
        try {
            const Zotero = window.parent?.Zotero || window.Zotero;
            if (Zotero && Zotero.Prefs) {
                const saved = Zotero.Prefs.get('aiChat.fontScale', true);
                if (saved !== undefined && saved !== null) {
                    // console.log('[AIChat] 从 Prefs 读取字体大小:', saved);
                    return parseFloat(saved);
                }
            }
        } catch (e) {
            console.warn('[AIChat] 无法从 Prefs 读取字体大小:', e);
        }
        return 1.0;
    });
    const [showFontSlider, setShowFontSlider] = useState(false);

    const [selectedModel, setSelectedModel] = useState(() => resolveInitialCustomModel());

    // 获取自定义模型配置（支持多配置，按 configId 读取）
    const getCustomModelConfig = useCallback((configId) => {
        try {
            const Zotero = window.parent?.Zotero || window.Zotero;
            if (Zotero && Zotero.Prefs) {
                const saved = Zotero.Prefs.get('aiChat.customModelConfigs', true);
                if (saved) {
                    const arr = JSON.parse(saved);
                    if (Array.isArray(arr) && configId) {
                        return arr.find(c => c.id === configId) || null;
                    }
                    // 兼容旧版单配置
                    const old = Zotero.Prefs.get('aiChat.customModelConfig', true);
                    if (old) return JSON.parse(old);
                }
            }
        } catch (e) {
            console.warn('[AIChat] Failed to get custom model config:', e);
        }
        return null;
    }, []);

    // 自定义接口能力由上游决定，客户端允许附图（base64）
    const visionCapable = true;

    const displayModel = useMemo(() => {
        if (selectedModel.key === 'custom') {
            const configId = selectedModel.configId;
            let config = getCustomModelConfig(configId);
            if (!config) {
                try {
                    const Z = window.parent?.Zotero;
                    const saved = Z?.Prefs?.get('aiChat.customModelConfigs', true);
                    if (saved) {
                        const arr = JSON.parse(saved);
                        if (Array.isArray(arr) && arr[0]) {
                            config = arr[0];
                        }
                    }
                    if (!config && Z?.Prefs) {
                        const old = Z.Prefs.get('aiChat.customModelConfig', true);
                        if (old) config = JSON.parse(old);
                    }
                } catch (_e) { /* ignore */ }
            }
            if (config) {
                return {
                    key: 'custom',
                    label: formatCustomModelLabel(config.name || config.modelName),
                    configId: config.id || configId,
                    config
                };
            }
        }
        return selectedModel;
    }, [selectedModel, getCustomModelConfig]);

    // 获取当前论文的 itemID
    const getItemID = useCallback(() => {
        return window.frameElement?.getAttribute('data-item-id');
    }, []);

    // 保存消息到数据库（只保存非欢迎消息）
    const saveMessagesToDB = useCallback(async (messagesToSave) => {
        const itemID = getItemID();
        if (!itemID) {
            console.warn('[AIChat] 无法保存：未找到 itemID');
            return;
        }

        try {
            // 过滤掉欢迎消息，只保存实际对话
            const filteredMessages = messagesToSave.filter(msg => !msg.isWelcome);

            // 序列化消息（移除 React 组件，只保留可序列化数据）
            const serializableMessages = filteredMessages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : '[React Component]',
                vibeCardRefs: msg.vibeCardRefs || [],
                images: msg.images?.map(img => ({
                    name: img.name,
                    type: img.type,
                    base64: img.base64,
                })) || [],
                timestamp: msg.timestamp || Date.now()
            }));

            await window.parent.Zotero.VibeDB.AIChats.save(parseInt(itemID), serializableMessages);
            // console.log(`[AIChat] ✓ 已保存 ${serializableMessages.length} 条消息到数据库`);
        } catch (error) {
            console.error('[AIChat] 保存消息失败:', error);
        }
    }, [getItemID]);

    // 从数据库加载历史消息（仅在组件初始化时调用一次）
    const loadHistoryFromDB = useCallback(async () => {
        const itemID = getItemID();
        if (!itemID) {
            // console.log('[AIChat] 未找到 itemID，跳过加载历史');
            setHistoryLoaded(true);
            return;
        }

        try {
            const result = await window.parent.Zotero.VibeDB.AIChats.get(parseInt(itemID));
            if (result && result.messages && Array.isArray(result.messages)) {
                // console.log(`[AIChat] ✓ 从数据库加载 ${result.messages.length} 条历史消息`);
                setMessages(result.messages);

                // 恢复对话历史到自定义 OpenAI / Anthropic 服务
                const serviceHistory = result.messages
                    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                    .map(msg => {
                        // 如果消息中有图片，重新构建多模态格式
                        if (msg.images && msg.images.length > 0) {
                            const withImg = msg.images.filter((img) => chatImageDataUrl(img));
                            if (withImg.length > 0) {
                                const messageContent = [{ type: 'text', text: msg.content }];
                                withImg.forEach((img) => {
                                    messageContent.push({
                                        type: 'image_url',
                                        image_url: { url: chatImageDataUrl(img) },
                                    });
                                });
                                return {
                                    role: msg.role,
                                    content: messageContent,
                                };
                            }
                        }
                        // 纯文本消息直接使用
                        return {
                            role: msg.role,
                            content: msg.content
                        };
                    });

                if (serviceHistory.length > 0) {
                    customOpenAIService.setHistory(serviceHistory);
                    customAnthropicService.setHistory(serviceHistory);
                }
            } else {
                // console.log('[AIChat] 数据库中无历史消息');
            }
        } catch (error) {
            console.error('[AIChat] 加载历史消息失败:', error);
        } finally {
            setHistoryLoaded(true);
        }
    }, [getItemID]); // 移除 selectedModel.key 依赖，避免模型切换时重新加载历史

    // 初始化时加载历史消息（仅执行一次）
    useEffect(() => {
        try {
            // API Key 已迁移到 Cloudflare Worker，不再需要在客户端设置
            // console.log('[AIChat] ✓ 使用 Cloudflare Worker 代理（API Key 已隐藏）');
        } catch (error) {
            console.warn('[AIChat] Error during initialization:', error);
        }

        // 加载历史消息
        loadHistoryFromDB();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 空依赖数组，确保只在组件挂载时执行一次

    // 应用字体大小到 CSS 变量
    useEffect(() => {
        const scaleValue = fontScale.toString();
        document.documentElement.style.setProperty('--panel-font-scale', scaleValue);

        // 调试日志：检查各个元素的实际字体大小
        setTimeout(() => {
            const container = document.querySelector('.ai-chat-container');
            const bubble = document.querySelector('.ant-bubble-content');
            const header = document.querySelector('.ai-chat-header h3');

            // console.log('[AIChat] 字体缩放已设置:', {
            //     scale: fontScale,
            //     cssValue: scaleValue,
            //     computed: getComputedStyle(document.documentElement).getPropertyValue('--panel-font-scale'),
            //     containerFontSize: container ? getComputedStyle(container).fontSize : 'N/A',
            //     headerFontSize: header ? getComputedStyle(header).fontSize : 'N/A',
            //     bubbleFontSize: bubble ? getComputedStyle(bubble).fontSize : 'N/A'
            // });
        }, 100);
    }, [fontScale]);

    useEffect(() => {
        setSelectedModel(resolveInitialCustomModel());
    }, []);

    // 处理字体大小变化（用户手动调整滑块）
    const handleFontScaleChange = (value) => {
        console.log('[AIChat] 用户调整字体大小:', value);
        setFontScale(value);

        // 保存到 Zotero Prefs（使用 Char 类型）
        try {
            const Zotero = window.parent?.Zotero || window.Zotero;
            if (Zotero && Zotero.Prefs) {
                Zotero.Prefs.set('aiChat.fontScale', String(value), true);
                console.log('[AIChat] 已保存字体大小到 Prefs:', value);
            }
        } catch (e) {
            console.error('[AIChat] 保存字体大小到 Prefs 失败:', e);
        }
    };

    // 获取 VibeCard 内容
    const getVibeCardContent = async (vibeCardId) => {
        // console.log(`[VibeCard] 开始获取内容: ${vibeCardId}`);
        try {
            if (window.parent && window.parent.Zotero && window.parent.Zotero.VibeCard) {
                const itemID = getItemID();
                if (itemID) {
                    // console.log(`[VibeCard] 使用 itemID: ${itemID} 调用 Zotero.VibeCard.getContent(${vibeCardId})`);
                    const content = await window.parent.Zotero.VibeCard.getContent(vibeCardId, parseInt(itemID));
                    // console.log(`[VibeCard] 获取到内容 (长度: ${content?.length || 0})`);
                    return content || `[VibeCard ${vibeCardId} content]`;
                } else {
                    const content = await window.parent.Zotero.VibeCard.getContent(vibeCardId);
                    return content || `[VibeCard ${vibeCardId} content]`;
                }
            }
            return `[VibeCard ${vibeCardId} content]`;
        } catch (error) {
            console.error(`[VibeCard] 获取内容失败 ${vibeCardId}:`, error);
            return `[VibeCard ${vibeCardId}]`;
        }
    };

    // 渲染用户消息内容（支持 VibeCard chip 和图片）
    const renderUserMessageContent = (content, vibeCardRefs = [], images = []) => {
        const parts = [];

        // 先渲染图片
        const imagesB64 = (images || []).filter((img) => chatImageDataUrl(img));
        if (imagesB64.length > 0) {
            parts.push(
                <div
                    key="images"
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: content ? 8 : 0
                    }}
                >
                    {imagesB64.map((img, idx) => (
                        <ChatImageLightbox
                            key={`img-${idx}`}
                            thumbnail
                            src={chatImageDataUrl(img)}
                            alt={img.name || 'image'}
                        />
                    ))}
                </div>
            );
        }

        // 如果没有 VibeCard 引用，直接返回文本
        if (!vibeCardRefs || vibeCardRefs.length === 0) {
            if (content) parts.push(content);
            return parts.length > 0 ? <>{parts}</> : content;
        }

        // 处理 VibeCard 引用
        const textParts = [];
        let lastIndex = 0;
        const nameToRefMap = {};
        vibeCardRefs.forEach(ref => {
            nameToRefMap[ref.name || ref.id] = ref;
        });

        const regex = /@([\w_]+)/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            const matchedName = match[1];
            const vibeCardRef = nameToRefMap[matchedName];

            if (vibeCardRef) {
                if (match.index > lastIndex) {
                    textParts.push(content.substring(lastIndex, match.index));
                }
                textParts.push(
                    <span
                        key={`chip-${vibeCardRef.id}-${match.index}`}
                        style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            margin: '0 2px',
                            borderRadius: '12px',
                            backgroundColor: '#f5f5f5',
                            border: '1px solid #e5e5e5',
                            color: '#262626',
                            fontSize: '0.9em',
                            fontWeight: '500',
                        }}
                    >
                        @{vibeCardRef.name || vibeCardRef.id}
                    </span>
                );
                lastIndex = regex.lastIndex;
            }
        }

        if (lastIndex < content.length) {
            textParts.push(content.substring(lastIndex));
        }

        // 合并图片和文本部分
        if (textParts.length > 0) {
            parts.push(<span key="text">{textParts}</span>);
        }

        return <>{parts}</>;
    };

    // 自动滚动到底部：仅当用户未手动滚动到上方时（靠近底部）才滚动，避免流式输出时强制跟随导致无法查看上方内容
    const SCROLL_NEAR_BOTTOM_THRESHOLD = 150;
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container || !messagesEndRef.current) return;
        const { scrollHeight, scrollTop, clientHeight } = container;
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        const isNearBottom = distanceToBottom <= SCROLL_NEAR_BOTTOM_THRESHOLD;
        if (isNearBottom) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // 发送消息处理
    const handleSend = async (text, vibeCardRefs = [], images = []) => {
        // 立刻设置 loading 状态，让 UI 立刻响应
        setLoading(true);

        const itemID = getItemID();

        let currentService;
        try {
            let configId = selectedModel.configId || (() => {
                try {
                    return (window.Zotero || window.parent?.Zotero)?.Prefs?.get('aiChat.customModelConfigId', true) || null;
                } catch (_) { return null; }
            })();
            let config = getCustomModelConfig(configId);
            if (!config) {
                const Z = window.parent?.Zotero;
                const saved = Z?.Prefs?.get('aiChat.customModelConfigs', true);
                if (saved) {
                    const arr = JSON.parse(saved);
                    if (Array.isArray(arr) && arr[0]) config = arr[0];
                }
            }
            if (!config) {
                const Z = window.parent?.Zotero;
                const oldSingle = Z?.Prefs?.get('aiChat.customModelConfig', true);
                if (oldSingle) config = JSON.parse(oldSingle);
            }
            if (!config || !config.baseUrl || !config.apiKey || !config.modelName) {
                antMessage.error(zoteroL10n('vibe-ai-chat-prompt-configure-custom-first'));
                setLoading(false);
                return false;
            }
            const apiFormat = config.apiFormat || 'openai';
            const customCfg = {
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                model: config.modelName
            };
            if (apiFormat === 'anthropic') {
                customAnthropicService.setConfig(customCfg);
                currentService = customAnthropicService;
            } else {
                customOpenAIService.setConfig(customCfg);
                currentService = customOpenAIService;
            }
        } catch (e) {
            console.error('Failed to load custom config', e);
            antMessage.error('自定义模型配置加载失败');
            setLoading(false);
            return false;
        }
        const hasPaperContext = currentService.hasPaperContext();

        // 如果还没有论文上下文，尝试获取
        if (itemID && window.parent?.Zotero?.VibeCard && !hasPaperContext) {
            try {
                // console.log(`[AIChat] 获取论文上下文: itemID=${itemID}`);
                let paperMarkdown = await window.parent.Zotero.VibeCard.getMarkdownContent(parseInt(itemID));
                const mdTrimmed = typeof paperMarkdown === 'string' ? paperMarkdown.trim() : '';
                if (!mdTrimmed && window.parent.Zotero.VibeCard.getPlainTextForAIChat) {
                    const plain = await window.parent.Zotero.VibeCard.getPlainTextForAIChat(parseInt(itemID));
                    if (plain && String(plain).trim()) {
                        paperMarkdown = String(plain).trim();
                    }
                }

                const finalContext = typeof paperMarkdown === 'string' ? paperMarkdown.trim() : '';
                if (!finalContext) {
                    // 论文还没解析完成，显示自定义 Modal 提示
                    console.warn('[AIChat] ⚠️ 论文 Markdown 为空，可能还在解析中');
                    Modal.confirm({
                        title: null,
                        content: NO_PAPER_CONTEXT_MSG,
                        okText: '确定',
                        cancelButtonProps: { style: { display: 'none' } },
                        centered: true,
                        width: 200,
                        bodyStyle: {
                            textAlign: 'center'
                        },
                        okButtonProps: {
                            style: {
                                backgroundColor: '#262626',
                                borderColor: '#262626',
                                color: '#ffffff',
                                fontWeight: 500,
                                height: '28px',
                                borderRadius: '6px',
                                fontSize: '13px'
                            }
                        },
                        modalRenderToBody: true,
                        style: {
                            borderRadius: '8px'
                        },
                        wrapClassName: 'ai-chat-modal'
                    });
                    setLoading(false);
                    return false; // 不继续处理，消息保留在输入框
                }

                // 已设置上下文：优先 VibeDB Markdown，否则当前阅读器 PDF 文字层
                currentService.setPaperContext(finalContext);
                // console.log(`[AIChat] ✓ 已设置论文上下文`);

            } catch (error) {
                console.error('[AIChat] 获取论文 Markdown 失败:', error);
                Modal.confirm({
                    title: null,
                    content: NO_PAPER_CONTEXT_MSG,
                    okText: '确定',
                    cancelButtonProps: { style: { display: 'none' } },
                    centered: true,
                    width: 240,
                    bodyStyle: {
                        textAlign: 'center'
                    },
                    okButtonProps: {
                        style: {
                            backgroundColor: '#262626',
                            borderColor: '#262626',
                            color: '#ffffff',
                            fontWeight: 500,
                            height: '30px',
                            borderRadius: '6px',
                            fontSize: '14px'
                        }
                    },
                    modalRenderToBody: true,
                    style: {
                        borderRadius: '8px'
                    },
                    wrapClassName: 'ai-chat-modal'
                });
                setLoading(false);
                return false; // 不继续处理，消息保留在输入框
            }
        }

        // 论文上下文已准备好，现在添加用户消息
        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: text,
            vibeCardRefs: vibeCardRefs,
            images: images, // 添加图片数据
            timestamp: Date.now()
        };

        // 替换 VibeCard 引用为实际内容
        let processedText = text;
        if (vibeCardRefs && vibeCardRefs.length > 0) {
            for (const vibeCardRef of vibeCardRefs) {
                const content = await getVibeCardContent(vibeCardRef.id);
                const regex = new RegExp(`@${vibeCardRef.name}`, 'g');
                processedText = processedText.replace(regex, `\n[引用内容开始]\n${content}\n[引用内容结束]\n`);
            }
        }

        // 构建消息内容：支持文本和图片的多模态格式
        let messageContent = processedText;
        const sendImages = (images || []).filter((img) => chatImageDataUrl(img));
        if (sendImages.length > 0) {
            messageContent = [{ type: 'text', text: processedText }];
            sendImages.forEach((img) => {
                messageContent.push({
                    type: 'image_url',
                    image_url: { url: chatImageDataUrl(img) },
                });
            });
        }

        // 创建 AI 消息占位符
        const aiMessageId = Date.now() + 1;
        const aiMessage = {
            id: aiMessageId,
            role: 'assistant',
            content: '',
            typing: true,
            timestamp: Date.now()
        };

        // 合并更新消息状态（使用函数式更新，确保基于最新状态）
        // 同时也避免了中间状态（只有 user message 没有 AI placeholder）的渲染
        setMessages(prev => [...prev, userMessage, aiMessage]);

        // 注意：这里去掉了 setLoading(true) 因为在函数开始时已经设置了

        // 请求硬失败（catch 或流式 onChunk 带 error）时统一：短暂展示后移除本轮用户+助手，与 OpenRouter 抛错路径一致
        const FAIL_ROUND_UI_MS = 3000;
        const scheduleRemoveFailedChatRound = (userMsgId, asstMsgId) => {
            setTimeout(() => {
                setMessages(prev =>
                    prev.filter(m => m.id !== asstMsgId && m.id !== userMsgId)
                );
            }, FAIL_ROUND_UI_MS);
        };

        const performChat = async () => {
            try {
                // 使用当前选择的 AI 服务（流式输出）
                // 如果有图片，发送多模态内容；否则发送纯文本
                await currentService.chatStream(
                    messageContent,
                    ({ done, content, fullMessage, interrupted, error, errorCode }) => {
                        if (!done && content) {
                            // 流式更新消息内容
                            setMessages(prev => prev.map(msg =>
                                msg.id === aiMessageId
                                    ? { ...msg, content: fullMessage, typing: true }
                                    : msg
                            ));
                        } else if (done) {
                            // 流式输出完成
                            let finalContent = fullMessage;
                            const isMmRejected =
                                interrupted && errorCode === MULTIMODAL_UNSUPPORTED_CODE;
                            // Gemini 等：在流内通过 error 结束而非 throw，须与 catch 同一套「不入库 + 延时移除」
                            const streamFailedHard =
                                interrupted && !!error && !isMmRejected;

                            if (interrupted) {
                                if (isMmRejected) {
                                    finalContent = zoteroL10n('vibe-ai-chat-multimodal-not-supported', {
                                        model: selectedModel.label,
                                    });
                                } else if (streamFailedHard) {
                                    // 与 catch 共用文案，禁止拼在 fullMessage 后（否则会出现 --- 段落等第三种样式）
                                    finalContent = buildChatHardFailureBubbleContent(String(error), {
                                        modelLabel: selectedModel.label,
                                        multimodalRejectedCode: errorCode,
                                    });
                                }
                            }

                            // 更新最终消息
                            const finalAIMessage = {
                                id: aiMessageId,
                                role: 'assistant',
                                content: finalContent,
                                typing: false,
                                interrupted,
                                isError: isMmRejected || streamFailedHard,
                                timestamp: Date.now()
                            };

                            setMessages(prev => {
                                const updatedMessages = prev.map(msg =>
                                    msg.id === aiMessageId ? finalAIMessage : msg
                                );

                                // 多模态被拒、流内 error 结束：均不入库（与 catch 一致）
                                if (!isMmRejected && !streamFailedHard) {
                                    saveMessagesToDB(updatedMessages);
                                }

                                return updatedMessages;
                            });

                            if (streamFailedHard) {
                                scheduleRemoveFailedChatRound(userMessage.id, aiMessageId);
                                antMessage.error({
                                    content: buildChatHardFailureToastContent(String(error), {
                                        modelLabel: selectedModel.label,
                                        multimodalRejectedCode: errorCode,
                                    }),
                                    duration: 5,
                                    style: { marginTop: '20vh' },
                                });
                            }

                            // 仅完整成功时扣费：中断 / API 报错 / 多模态被拒均不扣
                            const streamSucceeded = !interrupted && !isMmRejected;
                            // 重置 loading 状态
                            setLoading(false);
                        }
                    },
                    {
                        includeHistory: true,
                        model: displayModel.config?.modelName || selectedModel.key,
                        systemPrompt: VIBERO_AI_SYSTEM_PROMPT
                    }
                );
            } catch (error) {
                console.error('[AIChat] Error sending message:', error);

                const isMultimodalRejected = error?.code === MULTIMODAL_UNSUPPORTED_CODE;

                if (isMultimodalRejected) {
                    // 仅友好文案，不向用户展示接口原始英文/错误码（详情见控制台）
                    console.warn('[AIChat] 自定义接口拒绝多模态（原始信息）:', error.message);
                }

                const rawMsg = error.message || '';
                const errorContent = buildChatHardFailureBubbleContent(rawMsg, {
                    modelLabel: selectedModel.label,
                    multimodalRejectedCode: isMultimodalRejected ? MULTIMODAL_UNSUPPORTED_CODE : error?.code,
                });

                // 创建错误消息（只用于 UI 显示，不保存到数据库）
                const errorMessage = {
                    id: aiMessageId,
                    role: 'assistant',
                    content: errorContent,
                    typing: false,
                    isError: true,
                    timestamp: Date.now()
                };

                // 只在 UI 上显示错误消息，不保存到数据库
                setMessages(prev => {
                    const updatedMessages = prev.map(msg =>
                        msg.id === aiMessageId ? errorMessage : msg
                    );
                    // 不调用 saveMessagesToDB()，这样错误消息就不会被保存
                    return updatedMessages;
                });

                scheduleRemoveFailedChatRound(userMessage.id, aiMessageId);

                // 使用 Ant Design 的 message 组件显示通知
                antMessage.error({
                    content: buildChatHardFailureToastContent(rawMsg, {
                        modelLabel: selectedModel.label,
                        multimodalRejectedCode: isMultimodalRejected ? MULTIMODAL_UNSUPPORTED_CODE : error?.code,
                    }),
                    duration: isMultimodalRejected ? 6 : 5,
                    style: {
                        marginTop: '20vh',
                    }
                });
            } finally {
                // 确保无论成功或失败都重置 loading 状态
                setLoading(false);
            }
        };

        performChat();
        return true;
    };

    // 插入 VibeCard 引用
    const insertVibeCardReference = (vibeCardData) => {
        if (insertVibeCardRef.current) {
            insertVibeCardRef.current(vibeCardData);
        }
    };

    // 暴露方法给全局 API
    useEffect(() => {
        globalInsertVibeCard = insertVibeCardReference;
        globalClearMessages = () => {
            setMessages([]);
        };
        globalSetDragOverState = (isDragging, vibeCardId) => {
            setIsDragOver(isDragging);
            setDraggedVibeCardId(isDragging ? vibeCardId : null);
        };
    }, [insertVibeCardReference]);

    // 处理从 PDF View 拖拽 VibeCard 到 AI Chat 的 drop 事件
    const handleVibeCardDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();

        setIsDragOver(false);
        setDraggedVibeCardId(null);

        const vibeCardData = event.dataTransfer.getData('application/x-zotero-vibecard-reference');
        if (vibeCardData) {
            try {
                const data = JSON.parse(vibeCardData);
                if (data.vibeCardId && insertVibeCardRef.current) {
                    insertVibeCardRef.current({
                        id: data.vibeCardId,
                        name: data.vibeCardName || data.vibeCardId,
                        type: data.type,
                        vibeCardType: data.vibeCardType
                    });
                }
            } catch (error) {
                console.error('[AIChat] Error parsing VibeCard drop data:', error);
            }
        }
    };

    // 处理 dragover 事件以允许 drop
    const handleDragOver = (event) => {
        const types = event.dataTransfer.types;
        if (types.includes('application/x-zotero-vibecard-reference')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    // 模型切换处理
    const handleModelChange = (model) => {
        // console.log('[AIChat] 模型切换:', model);
        setSelectedModel(model);
    };

    // 清空对话历史
    const handleClearHistory = () => {
        Modal.confirm({
            title: '确认清空对话历史？',
            content: '此操作将清空当前所有对话记录和 AI 的上下文记忆。',
            okText: '确认',
            cancelText: '取消',
            onOk: async () => {
                // 清空所有 AI 服务历史
                customOpenAIService.clearHistory();
                customAnthropicService.clearHistory();

                // 清空消息状态
                setMessages([]);

                // 清空数据库
                const itemID = getItemID();
                if (itemID) {
                    try {
                        await window.parent.Zotero.VibeDB.AIChats.save(parseInt(itemID), []);
                        // console.log('[AIChat] ✓ 数据库历史已清空');
                    } catch (error) {
                        console.error('[AIChat] 清空数据库失败:', error);
                    }
                }

                antMessage.success('对话历史已清空');
            }
        });
    };

    return (
        <div
            className="ai-chat-container"
            onDrop={handleVibeCardDrop}
            onDragOver={handleDragOver}
            style={{ position: 'relative' }}
        >
            {/* 拖拽悬停遮罩层 */}
            {isDragOver && (
                <div
                    className="drag-overlay"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        pointerEvents: 'none',
                    }}
                >
                    <img
                        src={atIconSvg}
                        alt="@"
                        style={{ width: '80px', height: '80px', marginBottom: '16px' }}
                    />
                    <div style={{
                        fontSize: '20px',
                        fontWeight: 300,
                        color: '#262626',
                        marginBottom: '8px',
                    }}>
                        Drop content here to @!
                    </div>
                </div>
            )}

            {/* 头部 */}
            <div className="ai-chat-header">
                <Flex justify="space-between" align="center">
                    <h3>AI Chat</h3>
                    <Flex gap="small">
                        <Button
                            type="text"
                            size="small"
                            icon={<FontSizeOutlined />}
                            onClick={() => setShowFontSlider(!showFontSlider)}
                            title="调整字体大小"
                        />
                        <Button
                            type="text"
                            size="small"
                            onClick={handleClearHistory}
                            title="清空对话历史"
                        >
                            清空
                        </Button>
                    </Flex>
                </Flex>

                {/* 字体大小调整滑块 */}
                {showFontSlider && (
                    <div style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: 'var(--fill-quinary)',
                        borderRadius: '6px',
                        border: '1px solid var(--fill-quaternary)'
                    }}>
                        <Flex gap="small" align="center">
                            <span style={{ fontSize: '12px', color: 'var(--fill-secondary)' }}>字体大小</span>
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={fontScale}
                                onChange={(e) => handleFontScaleChange(parseFloat(e.target.value))}
                                style={{ flex: 1 }}
                            />
                            <span style={{
                                fontSize: '12px',
                                color: 'var(--fill-primary)',
                                minWidth: '3em',
                                textAlign: 'right'
                            }}>
                                {Math.round(fontScale * 100)}%
                            </span>
                            <Button
                                type="text"
                                size="small"
                                onClick={() => handleFontScaleChange(1.0)}
                                title="恢复默认"
                                style={{ fontSize: '12px', padding: '0 8px' }}
                            >
                                重置
                            </Button>
                        </Flex>
                    </div>
                )}
            </div>

            {/* 消息列表 */}
            <div className="ai-chat-messages" ref={messagesContainerRef}>
                {/* 静态欢迎消息（始终显示，不存入 messages 状态） */}
                {historyLoaded && (
                    <div className="welcome-section">
                        <div className="welcome-header">
                            <Bubble
                                placement="start"
                                variant="shadow"
                                content={
                                    <Flex gap="middle" align="center">
                                        {viberoLogo}
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 500, color: '#262626' }}>
                                                Welcome to Vibero!
                                            </div>
                                            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                                                🚀 Enjoy your vibe reading trip!
                                            </div>
                                        </div>
                                    </Flex>
                                }
                            />
                        </div>

                        {/* Action bar（只在没有对话时显示）
                        {messages.length === 0 && (
                            <div className="conversation-action-bar">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={loveActive ? null : (
                                        <img src={loveMessageSvg} alt="love" style={{ width: 16, height: 16, display: 'block' }} />
                                    )}
                                    onClick={() => {
                                        setLoveActive(true);
                                        setTimeout(() => setLoveActive(false), 3000);
                                    }}
                                >
                                    {loveActive ? welcomeActionText : null}
                                </Button>
                            </div>
                        )} */}
                    </div>
                )}

                {/* 逐条消息：用户 / 助手各一个气泡，不可拖拽 */}
                {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const isLast = msg.id === messages[messages.length - 1]?.id;
                    const assistantLoading =
                        !isUser && msg.content === '' && loading && isLast;

                    return (
                        <div
                            key={msg.id}
                            className={`chat-message-item ${msg.isError ? 'error-message' : ''}`}
                        >
                            <Bubble.List
                                roles={roles}
                                items={[
                                    {
                                        key: msg.id,
                                        role: msg.role,
                                        content: isUser
                                            ? renderUserMessageContent(
                                                msg.content,
                                                msg.vibeCardRefs,
                                                msg.images
                                            )
                                            : typeof msg.content === 'string'
                                                ? <MarkdownRenderer content={msg.content} />
                                                : msg.content,
                                        loading: assistantLoading,
                                    },
                                ]}
                            />
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="ai-chat-input-area">
                <SlateInputWithSender
                    onSubmit={handleSend}
                    loading={loading}
                    isDragOver={isDragOver}
                    draggedVibeCardId={draggedVibeCardId}
                    onVibeCardInsert={(insertFn) => {
                        insertVibeCardRef.current = insertFn;
                    }}
                    onModelChange={handleModelChange}
                    currentModel={displayModel}
                    visionCapable={visionCapable}
                />
            </div>
        </div>
    );
}

// 全局引用，用于从外部调用
let globalInsertVibeCard = null;
let globalClearMessages = null;
let globalSetDragOverState = null;

// 安全地初始化全局 API
const initializeGlobalAPI = () => {
    if (typeof window !== 'undefined') {
        window.aiChatAPI = {
            insertVibeCardReference: (vibeCardData) => {
                if (globalInsertVibeCard) {
                    globalInsertVibeCard(vibeCardData);
                }
            },
            clearMessages: () => {
                if (globalClearMessages) {
                    globalClearMessages();
                }
            },
            setDragOverState: (isDragging, vibeCardId) => {
                if (globalSetDragOverState) {
                    globalSetDragOverState(isDragging, vibeCardId);
                }
            }
        };
    }
};

// 挂载到 DOM
const rootElement = document.getElementById('root');

if (!rootElement) {
    console.error('[AIChat] ❌ Root element not found!');
} else {
    try {
        const root = createRoot(rootElement);
        root.render(<AIChatApp />);
        initializeGlobalAPI();
    } catch (error) {
        console.error('[AIChat] ❌ Error mounting React app:', error);
    }
}
