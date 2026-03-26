import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createEditor, Editor, Range, Transforms } from 'slate';
import { withHistory } from 'slate-history';
import { Editable, Slate, useFocused, useSelected, withReact } from 'slate-react';
import { GlobalOutlined, SendOutlined, DownOutlined, SettingOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Flex, theme, Dropdown, message as antMessage, Modal, Form, Input, Select } from 'antd';
import { formatCustomModelLabel, zoteroL10n } from './zoteroL10n';
import modelIcon from '../icons/model.svg';
import ImageUploader from './ImageUploader';
import ImagePreview from './ImagePreview';

const MENU_SLOT_PX = 20;
const TOOLBAR_ICON_PX = 18;

// VibeCard Mention 组件
const VibeCardMention = ({ attributes, children, element }) => {
    const selected = useSelected();
    const focused = useFocused();

    return (
        <span
            {...attributes}
            contentEditable={false}
            style={{
                padding: '2px 6px',
                margin: '0 2px',
                verticalAlign: 'baseline',
                display: 'inline-block',
                borderRadius: '12px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #e5e5e5',
                color: '#262626',
                fontSize: '0.9em',
                fontWeight: '500',
                boxShadow: selected && focused ? '0 0 0 2px rgba(0,0,0,0.06)' : 'none',
                cursor: 'default',
                transition: 'background-color .2s, border-color .2s, box-shadow .2s',
            }}
        >
            <span contentEditable={false}>
                @{element.vibeCardName || element.vibeCardId}
                {children}
            </span>
        </span>
    );
};

// 元素渲染器
const Element = ({ attributes, children, element }) => {
    switch (element.type) {
        case 'vibecard-mention':
            return <VibeCardMention attributes={attributes} children={children} element={element} />;
        default:
            return <div {...attributes}>{children}</div>;
    }
};

// 叶子节点渲染器
const Leaf = ({ attributes, children }) => {
    return <span {...attributes}>{children}</span>;
};

// 扩展编辑器以支持 VibeCard mentions
const withVibeCardMentions = (editor) => {
    const { isInline, isVoid } = editor;

    editor.isInline = (element) => {
        return element.type === 'vibecard-mention' ? true : isInline(element);
    };

    editor.isVoid = (element) => {
        return element.type === 'vibecard-mention' ? true : isVoid(element);
    };

    return editor;
};

// 插入 VibeCard mention
const insertVibeCardMention = (editor, vibeCardData, targetRange = null, searchText = '') => {
    const mention = {
        type: 'vibecard-mention',
        vibeCardId: vibeCardData.id,
        vibeCardName: vibeCardData.name,
        children: [{ text: '' }],
    };

    if (targetRange) {
        try {
            const endPoint = Range.end(targetRange);
            const distance = (searchText?.length || 0) + 1;
            const anchorPoint = Editor.before(editor, endPoint, { distance, unit: 'character' });
            if (anchorPoint) {
                const exactRange = { anchor: anchorPoint, focus: endPoint };
                Transforms.select(editor, exactRange);
                Transforms.delete(editor);
            } else {
                Transforms.select(editor, targetRange);
                Transforms.delete(editor);
            }
        } catch (err) {
            Transforms.select(editor, targetRange);
            Transforms.delete(editor);
        }
    }

    Transforms.insertNodes(editor, mention);
    Transforms.move(editor);
};

// Slate 输入框组件（使用 Ant Design X Sender 样式）
const SlateInputWithSender = ({
    onSubmit,
    loading,
    onVibeCardInsert,
    onModelChange,
    currentModel,
    visionCapable = true,
}) => {
    const { token } = theme.useToken();
    const editorRef = useRef();
    if (!editorRef.current) {
        editorRef.current = withVibeCardMentions(withReact(withHistory(createEditor())));
    }
    const editor = editorRef.current;

    const [value, setValue] = useState([
        {
            type: 'paragraph',
            children: [{ text: '' }],
        },
    ]);

    const [webSearchEnabled, setWebSearchEnabled] = useState(false);

    // 自定义模型多配置
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [form] = Form.useForm();
    const [customConfigs, setCustomConfigs] = useState([]);
    const [editingConfigId, setEditingConfigId] = useState(null);
    const [addFormFlash, setAddFormFlash] = useState(false);
    const apiFormatWatched = Form.useWatch('apiFormat', form);
    const apiFormatForUrlPlaceholder = apiFormatWatched ?? 'openai';

    const getZotero = () => window.Zotero || window.parent?.Zotero || window.top?.Zotero;

    // 读取所有自定义模型配置
    const getCustomModelConfigs = useCallback(() => {
        try {
            const Zotero = getZotero();
            if (Zotero && Zotero.Prefs) {
                const saved = Zotero.Prefs.get('aiChat.customModelConfigs', true);
                if (saved) {
                    const arr = JSON.parse(saved);
                    return Array.isArray(arr) ? arr : [];
                }
                // 迁移：旧版单配置 -> 新版多配置
                const oldSingle = Zotero.Prefs.get('aiChat.customModelConfig', true);
                if (oldSingle) {
                    try {
                        const old = JSON.parse(oldSingle);
                        const migrated = [{
                            id: `custom-${Date.now()}`,
                            name: old.modelName || zoteroL10n('vibe-ai-chat-custom-model-fallback'),
                            baseUrl: old.baseUrl || '',
                            apiKey: old.apiKey || '',
                            modelName: old.modelName || '',
                            apiFormat: old.apiFormat || 'openai'
                        }];
                        Zotero.Prefs.set('aiChat.customModelConfigs', JSON.stringify(migrated), true);
                        Zotero.Prefs.set('aiChat.customModelConfigId', migrated[0].id, true);
                        return migrated;
                    } catch (_) {
                        return [];
                    }
                }
            }
        } catch (e) {
            console.warn('[SlateInput] Failed to get custom model configs:', e);
        }
        return [];
    }, []);

    // 根据 configId 获取单条配置
    const getCustomModelConfigById = useCallback((configId) => {
        const configs = getCustomModelConfigs();
        return configs.find(c => c.id === configId) || null;
    }, [getCustomModelConfigs]);

    // 保存配置列表
    const saveCustomModelConfigs = useCallback((configs) => {
        try {
            const Zotero = getZotero();
            if (Zotero && Zotero.Prefs) {
                Zotero.Prefs.set('aiChat.customModelConfigs', JSON.stringify(configs), true);
                return true;
            }
        } catch (e) {
            console.error('[SlateInput] Failed to save custom model configs:', e);
        }
        return false;
    }, []);

    // 获取当前选中的 configId
    const getSelectedConfigId = useCallback(() => {
        try {
            const Zotero = getZotero();
            if (Zotero && Zotero.Prefs) {
                return Zotero.Prefs.get('aiChat.customModelConfigId', true) || null;
            }
        } catch (_) {}
        return null;
    }, []);

    const setSelectedConfigId = (id) => {
        try {
            const Zotero = getZotero();
            if (Zotero && Zotero.Prefs) {
                Zotero.Prefs.set('aiChat.customModelConfigId', id || '', true);
            }
        } catch (_) {}
    };

    // 打开弹窗时：有配置则默认选中 Prefs 中当前项或列表第一项并填入表单；无配置则进入「新建」空表
    useEffect(() => {
        if (!isConfigModalOpen) return;
        const list = getCustomModelConfigs();
        setCustomConfigs(list);
        if (!list.length) {
            setEditingConfigId(null);
            form.resetFields();
            form.setFieldsValue({ apiFormat: 'openai' });
            return;
        }
        const prefId = getSelectedConfigId();
        const pick = list.find(c => c.id === prefId) || list[0];
        setEditingConfigId(pick.id);
        form.setFieldsValue({
            baseUrl: pick.baseUrl,
            apiKey: pick.apiKey,
            modelName: pick.modelName,
            apiFormat: pick.apiFormat || 'openai'
        });
    }, [isConfigModalOpen, getCustomModelConfigs, getSelectedConfigId, form]);

    const handleSaveConfig = () => {
        form.validateFields().then(values => {
            const wasEditing = !!editingConfigId;
            const { baseUrl, apiKey, modelName, apiFormat } = values;
            const configs = getCustomModelConfigs();
            const configToSave = {
                baseUrl,
                apiKey,
                modelName,
                apiFormat: apiFormat || 'openai'
            };

            if (editingConfigId) {
                const idx = configs.findIndex(c => c.id === editingConfigId);
                if (idx >= 0) {
                    configs[idx] = { ...configs[idx], ...configToSave };
                }
            } else {
                configs.push({
                    id: `custom-${Date.now()}`,
                    ...configToSave
                });
            }

            if (saveCustomModelConfigs(configs)) {
                const editedId = editingConfigId;
                setCustomConfigs(configs);
                const target = wasEditing && editedId
                    ? configs.find(c => c.id === editedId)
                    : configs[configs.length - 1];
                if (target) {
                    setEditingConfigId(target.id);
                    form.setFieldsValue({
                        baseUrl: target.baseUrl,
                        apiKey: target.apiKey,
                        modelName: target.modelName,
                        apiFormat: target.apiFormat || 'openai'
                    });
                } else {
                    setEditingConfigId(null);
                    form.resetFields();
                    form.setFieldsValue({ apiFormat: 'openai' });
                }
                antMessage.success(zoteroL10n(wasEditing ? 'vibe-ai-chat-config-updated' : 'vibe-ai-chat-config-added'));
                if (onModelChange && configs.length > 0 && target) {
                    setSelectedConfigId(target.id);
                    onModelChange({
                        key: 'custom',
                        label: formatCustomModelLabel(target.modelName),
                        configId: target.id,
                        config: target
                    });
                }
            } else {
                antMessage.error(zoteroL10n('vibe-ai-chat-config-save-failed'));
            }
        });
    };

    const handleDeleteConfig = (config) => {
        const displayName = getConfigDisplayName(config);
        Modal.confirm({
            title: zoteroL10n('vibe-ai-chat-confirm-delete-title'),
            content: zoteroL10n('vibe-ai-chat-confirm-delete-body', { name: displayName }),
            okText: zoteroL10n('vibe-ai-chat-button-delete'),
            cancelText: zoteroL10n('general-cancel'),
            okButtonProps: { danger: true },
            centered: true,
            bodyStyle: { textAlign: 'center' },
            wrapClassName: 'ai-chat-modal',
            zIndex: 10002,
            onOk: () => {
                const idToDelete = config.id;
                const configs = getCustomModelConfigs().filter(c => c.id !== idToDelete);
                if (saveCustomModelConfigs(configs)) {
                    setCustomConfigs(configs);
                    setSelectedConfigId(configs.length > 0 ? configs[0].id : null);
                    if (editingConfigId === idToDelete) {
                        if (configs.length === 0) {
                            setEditingConfigId(null);
                            form.resetFields();
                            form.setFieldsValue({ apiFormat: 'openai' });
                        } else {
                            const next = configs[0];
                            setEditingConfigId(next.id);
                            form.setFieldsValue({
                                baseUrl: next.baseUrl,
                                apiKey: next.apiKey,
                                modelName: next.modelName,
                                apiFormat: next.apiFormat || 'openai'
                            });
                        }
                    }
                    antMessage.success(zoteroL10n('vibe-ai-chat-config-deleted'));
                }
            }
        });
    };

    const handleAddConfig = () => {
        const alreadyOnAddPage = editingConfigId === null;
        setEditingConfigId(null);
        form.resetFields();
        form.setFieldsValue({ apiFormat: 'openai' });
        if (alreadyOnAddPage) {
            setAddFormFlash(false);
            requestAnimationFrame(() => {
                setAddFormFlash(true);
                window.setTimeout(() => setAddFormFlash(false), 550);
            });
        }
    };

    const handleSelectConfigToEdit = (config) => {
        setEditingConfigId(config.id);
        form.setFieldsValue({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            modelName: config.modelName,
            apiFormat: config.apiFormat || 'openai'
        });
    };

    const getConfigDisplayName = (c) => c.modelName || c.name || zoteroL10n('vibe-ai-chat-unnamed');

    // 图片状态
    const [attachedImages, setAttachedImages] = useState([]);

    const renderElement = useCallback((props) => <Element {...props} />, []);
    const renderLeaf = useCallback((props) => <Leaf {...props} />, []);

    // 暴露插入 VibeCard 的方法给父组件
    useEffect(() => {
        if (onVibeCardInsert) {
            onVibeCardInsert((vibeCardData) => {
                insertVibeCardMention(editor, vibeCardData);
            });
        }
    }, [editor, onVibeCardInsert]);

    // 提取纯文本和 VibeCard 引用
    const extractContent = () => {
        const text = editor.children
            .map((node) => {
                return node.children
                    .map((child) => {
                        if (child.type === 'vibecard-mention') {
                            // 使用 name 而不是 id，确保与替换逻辑一致
                            return `@${child.vibeCardName || child.vibeCardId}`;
                        }
                        return child.text || '';
                    })
                    .join('');
            })
            .join('\n');

        const vibeCardRefs = [];
        editor.children.forEach((node) => {
            node.children.forEach((child) => {
                if (child.type === 'vibecard-mention') {
                    vibeCardRefs.push({
                        id: child.vibeCardId,
                        name: child.vibeCardName || child.vibeCardId
                    });
                }
            });
        });

        return { text, vibeCardRefs };
    };

    // 检查编辑器是否为空（包括图片）
    const isEditorEmpty = () => {
        const { text, vibeCardRefs } = extractContent();
        return !text.trim() && vibeCardRefs.length === 0 && attachedImages.length === 0;
    };

    // 附图仅本地 base64，随对话写入 VibeDB
    const handleImageSelect = useCallback(async (imageData) => {
        if (!visionCapable) {
            antMessage.warning(
                zoteroL10n('vibe-ai-chat-multimodal-not-supported', {
                    model: currentModel?.label || currentModel?.key || '',
                })
            );
            return;
        }
        setAttachedImages(prev => [...prev, { ...imageData, base64: imageData.base64 }]);
        antMessage.success('已添加图片');
    }, [visionCapable, currentModel?.label, currentModel?.key]);

    // 移除图片
    const handleImageRemove = useCallback((index) => {
        setAttachedImages(prev => prev.filter((_, i) => i !== index));
    }, []);

    /** 从 MIME 取上传用扩展名（与剪贴板/截图常见类型一致） */
    const extFromImageMime = useCallback((mime) => {
        if (!mime || !mime.startsWith('image/')) return 'png';
        const sub = mime.slice('image/'.length).toLowerCase();
        if (sub === 'jpeg') return 'jpg';
        return sub.replace(/[^a-z0-9]/g, '') || 'png';
    }, []);

    // Ctrl/Cmd+V 粘贴图片：与工具栏选图同一路径（→ attachedImages → base64）
    const handlePaste = useCallback(
        async (event) => {
            const dt = event.clipboardData;
            if (!dt) return;

            const imageFiles = [];
            const seen = new Set();
            const pushFile = (file) => {
                if (!file || !file.type?.startsWith('image/')) return;
                // 避免同一 Blob 在 items + files 里重复
                const key = `${file.size}:${file.type}:${file.lastModified}`;
                if (seen.has(key)) return;
                seen.add(key);
                imageFiles.push(file);
            };

            if (dt.items?.length) {
                for (let i = 0; i < dt.items.length; i++) {
                    const item = dt.items[i];
                    if (item.kind === 'file' && item.type?.startsWith('image/')) {
                        const f = item.getAsFile();
                        pushFile(f);
                    }
                }
            }
            if (dt.files?.length) {
                for (let i = 0; i < dt.files.length; i++) {
                    pushFile(dt.files[i]);
                }
            }

            if (imageFiles.length === 0) return;

            event.preventDefault();
            event.stopPropagation();

            const maxBytes = 10 * 1024 * 1024;
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                if (file.size > maxBytes) {
                    antMessage.error('图片大小不能超过 10MB');
                    continue;
                }
                let base64;
                try {
                    base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target?.result);
                        reader.onerror = () => reject(new Error('读取图片失败'));
                        reader.readAsDataURL(file);
                    });
                } catch (err) {
                    console.error('[SlateInput] 粘贴读图失败:', err);
                    antMessage.error(err?.message || '读取图片失败');
                    continue;
                }
                if (!base64) continue;

                const ext = extFromImageMime(file.type);
                const safeName =
                    file.name && String(file.name).trim()
                        ? file.name
                        : `paste_${Date.now()}_${i}.${ext}`;

                await handleImageSelect({
                    base64,
                    file,
                    type: 'paste',
                    name: safeName,
                });
            }
        },
        [extFromImageMime, handleImageSelect]
    );

    // 内部提交状态，防止快速重复点击导致的竞态问题
    // 使用 useRef 而非 useState，因为 ref 更新是同步的，可以立即阻止第二次回车
    const submittingRef = useRef(false);

    // 处理发送
    const handleSubmit = useCallback(async () => {
        // 防止重复提交：检查 loading (父组件状态) 和 submittingRef (本地同步锁)
        if (isEditorEmpty() || loading || submittingRef.current) return;

        // 立即设置本地提交状态（同步更新，立即生效）
        submittingRef.current = true;

        try {
            // 基本检查：只做同步的快速检查，耗时检查（如余额）移到父组件
            const Zotero = window.Zotero || window.parent?.Zotero || window.top?.Zotero;
            if (!Zotero) {
                antMessage.error('无法访问 Zotero，请重启客户端');
                return;
            }

            // 提取内容
            const { text, vibeCardRefs } = extractContent();

            // 先保存当前的图片数组（避免被清空前就丢失）
            const imagesToSend = [...attachedImages];

            // 立即清空 UI（提升用户体验，不等待 onSubmit 返回）
            Transforms.delete(editor, {
                at: {
                    anchor: Editor.start(editor, []),
                    focus: Editor.end(editor, []),
                },
            });
            setAttachedImages([]);

            // 调用父组件的 onSubmit（父组件会设置 loading 状态并进行余额检查）
            // 注意：不再等待结果，让父组件处理后续逻辑
            onSubmit(text, vibeCardRefs, imagesToSend);

        } catch (e) {
            console.error('[SlateInput] handleSubmit execution failed:', e);
            antMessage.error('发送失败: ' + e.message);
        } finally {
            submittingRef.current = false;
        }
    }, [loading, attachedImages, editor, onSubmit]);

    // 处理键盘事件
    const handleKeyDown = useCallback(
        (event) => {
            // Enter 提交（Shift+Enter 换行）
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                // 禁用状态下不允许提交（检查 loading 和 submittingRef）
                // submittingRef.current 是同步值，可以立即阻止第二次回车
                if (loading || submittingRef.current || isEditorEmpty()) {
                    return;
                }
                handleSubmit();
            }
        },
        [loading, attachedImages, handleSubmit]
    );

    // 处理拖拽放置事件（VibeCard 引用）
    const handleDrop = useCallback(
        (event) => {
            // 检查是否是 VibeCard 拖拽
            const vibeCardData = event.dataTransfer.getData('application/x-zotero-vibecard-reference');
            if (vibeCardData) {
                event.preventDefault();
                event.stopPropagation();

                try {
                    const data = JSON.parse(vibeCardData);
                    // console.log('[SlateInput] VibeCard dropped:', data);

                    if (data.vibeCardId) {
                        // 插入 VibeCard mention
                        insertVibeCardMention(editor, {
                            id: data.vibeCardId,
                            name: data.vibeCardName || data.vibeCardId,
                            type: data.type,
                            vibeCardType: data.vibeCardType
                        });
                        // console.log('[SlateInput] VibeCard mention inserted:', data);
                    }
                } catch (error) {
                    console.error('[SlateInput] Error parsing VibeCard drop data:', error);
                }
            }
            // 如果不是 VibeCard，让浏览器处理默认的文本拖拽
        },
        [editor]
    );

    // 处理拖拽悬停事件
    const handleDragOver = useCallback(
        (event) => {
            // 检查是否是 VibeCard 拖拽
            const types = event.dataTransfer.types;
            if (types.includes('application/x-zotero-vibecard-reference')) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
            }
        },
        []
    );

    const handleChange = useCallback(
        (newValue) => {
            setValue(newValue);
        },
        []
    );

    const iconStyle = {
        fontSize: 18,
        color: token.colorText,
    };

    // 仅自定义模型：配置项 + 管理入口
    const customConfigsList = getCustomModelConfigs();

    const handleModelSelect = ({ key }) => {
        if (key === '__custom_manage__') {
            setIsConfigModalOpen(true);
            return;
        }
        const config = customConfigsList.find(c => c.id === key);
        if (config) {
            setSelectedConfigId(config.id);
            if (onModelChange) {
                onModelChange({
                    key: 'custom',
                    label: formatCustomModelLabel(config.modelName || config.name),
                    configId: config.id,
                    config
                });
            }
        }
    };

    const displayModel = (() => {
        if (currentModel?.key === 'custom' && currentModel?.configId) {
            const cfg = getCustomModelConfigById(currentModel.configId);
            return cfg
                ? formatCustomModelLabel(cfg.modelName || cfg.name)
                : (currentModel?.label || zoteroL10n('vibe-ai-chat-custom-model-fallback'));
        }
        return currentModel?.label || zoteroL10n('vibe-ai-chat-custom-model-fallback');
    })();

    const selectedMenuKey =
        currentModel?.configId || getSelectedConfigId() || customConfigsList[0]?.id || '__custom_manage__';

    const toolbarBrandIcon = (
        <img src={modelIcon} alt="" style={{ width: TOOLBAR_ICON_PX, height: TOOLBAR_ICON_PX, marginRight: 4, objectFit: 'contain' }} />
    );

    const selectableMenuKeysSet = new Set([...customConfigsList.map((c) => c.id), '__custom_manage__']);
    const menuSelectedKeys =
        selectedMenuKey && selectableMenuKeysSet.has(selectedMenuKey) ? [selectedMenuKey] : [];

    const customModelMenuRows = customConfigsList.map((c) => {
        const customLabel = formatCustomModelLabel(c.modelName || c.name);
        return {
            key: c.id,
            label: (
                <Flex align="center" gap={6} style={{ minWidth: 0, maxWidth: 280 }} title={customLabel}>
                    <span
                        style={{
                            width: MENU_SLOT_PX,
                            height: MENU_SLOT_PX,
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <img src={modelIcon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                    </span>
                    <span
                        style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 12,
                            lineHeight: 1.25,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {customLabel}
                    </span>
                    <span
                        style={{
                            width: 18,
                            flexShrink: 0,
                            textAlign: 'right',
                            fontSize: 12,
                            color: token.colorPrimary,
                        }}
                    >
                        {selectedMenuKey === c.id ? '✓' : ''}
                    </span>
                </Flex>
            ),
            disabled: false,
        };
    });
    const customManageMenuItem = {
        key: '__custom_manage__',
        label: (
            <Flex justify="space-between" align="center" style={{ width: '100%', minWidth: 160 }}>
                <span>{zoteroL10n('vibe-ai-chat-manage-custom-models')}</span>
                <SettingOutlined style={{ fontSize: 14 }} />
            </Flex>
        ),
        disabled: false,
    };

    const dropdownModelItems = [...customModelMenuRows, customManageMenuItem];

    return (
        <div
            style={{
                background: 'var(--material-background, #ffffff)',
                border: '1px solid var(--fill-quinary, #e0e0e0)',
                borderRadius: '8px',
                transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            className="slate-sender-container"
        >
            {/* 图片预览区域 */}
            <ImagePreview
                images={attachedImages}
                onRemove={handleImageRemove}
            />

            {/* Slate 编辑器区域 */}
            <div style={{ padding: '8px 12px' }}>
                <Slate editor={editor} initialValue={value} onChange={handleChange}>
                    <Editable
                        renderElement={renderElement}
                        renderLeaf={renderLeaf}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        placeholder="Press Enter to send message"
                        disabled={loading}
                        style={{
                            minHeight: '36px',
                            maxHeight: '120px',
                            fontSize: '14px',
                            color: 'var(--fill-primary, #333)',
                            outline: 'none',
                            overflowY: 'auto',
                            lineHeight: '1.5',
                        }}
                    />
                </Slate>
            </div>

            {/* Footer 工具栏 */}
            <div
                style={{
                    padding: '8px 12px',
                    borderTop: '1px solid var(--fill-quinary, #f0f0f0)',
                }}
            >
                <Flex justify="space-between" align="center" style={{ minWidth: 0, gap: 8 }}>
                    {/* 左侧工具：minWidth:0 避免长模型名把整行挤出视口 */}
                    <Flex gap="small" align="center" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                        {/* 图片上传和截图按钮 */}
                        <ImageUploader
                            onImageSelect={handleImageSelect}
                            iconStyle={iconStyle}
                            disabled={!visionCapable}
                            disabledTitle={zoteroL10n('vibe-ai-chat-multimodal-not-supported', {
                                model: currentModel?.label || currentModel?.key || '',
                            })}
                        />
                        <Button
                            type="text"
                            icon={<GlobalOutlined />}
                            onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                            title="Web Search"
                            className={webSearchEnabled ? 'icon-btn-active' : ''}
                            style={iconStyle}
                        />
                        <Dropdown
                            placement="bottomCenter"
                            getPopupContainer={(triggerNode) =>
                                (triggerNode?.ownerDocument || document).body
                            }
                            menu={{
                                items: dropdownModelItems,
                                onClick: handleModelSelect,
                                className: 'model-dropdown-menu',
                                selectedKeys: menuSelectedKeys
                            }}
                            trigger={['click']}
                        >
                            <Button
                                type="text"
                                style={{
                                    ...iconStyle,
                                    flexShrink: 1,
                                    minWidth: 0,
                                    maxWidth: '100%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                }}
                                title={zoteroL10n('vibe-ai-chat-current-model-title', { model: displayModel })}
                            >
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        minWidth: 0,
                                        maxWidth: '100%',
                                        flex: 1,
                                    }}
                                >
                                    {toolbarBrandIcon}
                                    <span
                                        style={{
                                            marginRight: 4,
                                            fontSize: 14,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            minWidth: 0,
                                        }}
                                    >
                                        {displayModel}
                                    </span>
                                </span>
                                <DownOutlined style={{ fontSize: 12, flexShrink: 0 }} />
                            </Button>
                        </Dropdown>
                    </Flex>

                    {/* 右侧工具 */}
                    <Flex align="center" gap="small">
                        <Button
                            className="btn-black"
                            icon={<SendOutlined />}
                            loading={loading}
                            disabled={isEditorEmpty()}
                            onClick={handleSubmit}
                        >
                            Send
                        </Button>
                    </Flex>
                </Flex>
            </div>

            {/* 自定义模型配置弹窗（多配置管理） */}
            <Modal
                title={zoteroL10n('vibe-ai-chat-custom-model-settings-title')}
                open={isConfigModalOpen}
                onOk={handleSaveConfig}
                onCancel={() => { setIsConfigModalOpen(false); setEditingConfigId(null); form.resetFields(); }}
                okText={editingConfigId ? zoteroL10n('vibe-ai-chat-button-update') : zoteroL10n('vibe-ai-chat-button-add')}
                cancelText={zoteroL10n('vibe-ai-chat-button-close')}
                destroyOnClose
                zIndex={10001}
                centered
                getContainer={false}
                wrapClassName="ai-chat-modal"
                width={580}
            >
                <Flex gap="middle" align="flex-start" style={{ marginBottom: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>{zoteroL10n('vibe-ai-chat-saved-configurations')}</div>
                        <div style={{
                            border: '1px solid var(--fill-quinary, #e8e8e8)',
                            borderRadius: 6,
                            maxHeight: 180,
                            overflowY: 'auto',
                            background: '#ffffff'
                        }}>
                            {customConfigs.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => handleSelectConfigToEdit(c)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 12px',
                                        borderBottom: customConfigs.indexOf(c) < customConfigs.length - 1 ? '1px solid var(--fill-quinary, #f0f0f0)' : 'none',
                                        cursor: 'pointer',
                                        background: editingConfigId === c.id ? '#f0f0f0' : '#ffffff'
                                    }}
                                >
                                    <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {getConfigDisplayName(c)}
                                    </span>
                                    <Button type="text" size="small" icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDeleteConfig(c); }} className="custom-config-delete-btn" style={{ padding: '0 6px', flexShrink: 0 }} />
                                </div>
                            ))}
                        </div>
                        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddConfig} style={{ marginTop: 8, width: '100%' }}>
                            {zoteroL10n('vibe-ai-chat-add-configuration')}
                        </Button>
                    </div>
                    <div
                        className={addFormFlash ? 'custom-config-form-pane custom-config-form-flash' : 'custom-config-form-pane'}
                        style={{ flex: 1.2, minWidth: 0 }}
                    >
                        <Form form={form} layout="vertical" preserve={false} initialValues={{ apiFormat: 'openai' }}>
                            <Form.Item
                                label={zoteroL10n('vibe-ai-chat-api-base-url')}
                                required
                                tooltip={zoteroL10n('vibe-ai-chat-api-base-url-row-tooltip')}
                            >
                                <Flex gap={8} align="center" style={{ width: '100%' }}>
                                    <Form.Item name="apiFormat" noStyle initialValue="openai" rules={[{ required: true }]}>
                                        <Select
                                            style={{ width: 152, flexShrink: 0 }}
                                            popupMatchSelectWidth={false}
                                            options={[
                                                { value: 'openai', label: zoteroL10n('vibe-ai-chat-api-format-label-openai') },
                                                { value: 'anthropic', label: zoteroL10n('vibe-ai-chat-api-format-label-anthropic') }
                                            ]}
                                        />
                                    </Form.Item>
                                    <Form.Item name="baseUrl" noStyle rules={[{ required: true }]} style={{ flex: 1, minWidth: 0 }}>
                                        <Input
                                            placeholder={
                                                apiFormatForUrlPlaceholder === 'anthropic'
                                                    ? zoteroL10n('vibe-ai-chat-api-base-url-placeholder-anthropic')
                                                    : zoteroL10n('vibe-ai-chat-api-base-url-placeholder-openai')
                                            }
                                        />
                                    </Form.Item>
                                </Flex>
                            </Form.Item>
                            <Form.Item
                                label={zoteroL10n('vibe-ai-chat-api-key-shared')}
                                name="apiKey"
                                rules={[{ required: true }]}
                                tooltip={zoteroL10n('vibe-ai-chat-api-key-tooltip')}
                            >
                                <Input.Password placeholder={zoteroL10n('vibe-ai-chat-api-key-placeholder')} autoComplete="off" visibilityToggle={false} />
                            </Form.Item>
                            <Form.Item
                                label={zoteroL10n('vibe-ai-chat-model-name')}
                                name="modelName"
                                rules={[{ required: true }]}
                                tooltip={zoteroL10n('vibe-ai-chat-model-name-tooltip')}
                            >
                                <Input placeholder={zoteroL10n('vibe-ai-chat-model-name-placeholder')} />
                            </Form.Item>
                        </Form>
                    </div>
                </Flex>
            </Modal>
        </div>
    );
};

export default SlateInputWithSender;
