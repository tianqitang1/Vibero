import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PictureOutlined, ScissorOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';

/**
 * 图片上传和截图组件
 * 
 * 截图功能说明：
 * - 由于 AI Chat 运行在 iframe 中，无法直接访问父窗口 DOM
 * - 截图通过通知父窗口进入截图模式，由父窗口完成截图后回传结果
 * - 使用 postMessage 进行跨 iframe 通信
 * 
 * @param {Function} onImageSelect - 图片选择回调，参数为 { base64, file, type: 'upload' | 'screenshot' }
 * @param {Object} iconStyle - 图标样式
 */
const ImageUploader = ({ onImageSelect, iconStyle = {}, disabled = false, disabledTitle = '' }) => {
    const fileInputRef = useRef(null);
    const [isWaitingScreenshot, setIsWaitingScreenshot] = useState(false);

    // 处理文件选择
    const handleFileChange = useCallback((event) => {
        if (disabled) return;
        const file = event.target.files?.[0];
        if (!file) return;

        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            message.error('请选择图片文件');
            return;
        }

        // 验证文件大小（限制 10MB）
        if (file.size > 10 * 1024 * 1024) {
            message.error('图片大小不能超过 10MB');
            return;
        }

        // 读取为 base64
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result;
            if (base64 && onImageSelect) {
                onImageSelect({
                    base64,
                    file,
                    type: 'upload',
                    name: file.name
                });
            }
        };
        reader.onerror = () => {
            message.error('读取图片失败');
        };
        reader.readAsDataURL(file);

        // 清空 input，允许重复选择同一文件
        event.target.value = '';
    }, [onImageSelect, disabled]);

    // 触发文件选择
    const handleUploadClick = useCallback(() => {
        if (disabled) {
            if (disabledTitle) message.warning(disabledTitle);
            return;
        }
        fileInputRef.current?.click();
    }, [disabled, disabledTitle]);

    // 监听来自父窗口的截图结果
    useEffect(() => {
        const handleMessage = (event) => {
            // 处理截图结果
            if (event.data?.type === 'screenshot-result') {
                setIsWaitingScreenshot(false);
                
                if (event.data.success && event.data.base64) {
                    console.log('[ImageUploader] 收到截图结果');
                    if (onImageSelect) {
                        onImageSelect({
                            base64: event.data.base64,
                            type: 'screenshot',
                            name: `screenshot_${Date.now()}.png`,
                            width: event.data.width,
                            height: event.data.height
                        });
                    }
                    message.success('截图成功');
                } else if (event.data.cancelled) {
                    console.log('[ImageUploader] 截图已取消');
                } else {
                    message.error('截图失败: ' + (event.data.error || '未知错误'));
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onImageSelect]);

    // 开始截图 - 通知父窗口进入截图模式
    const startScreenshot = useCallback(() => {
        if (disabled) {
            if (disabledTitle) message.warning(disabledTitle);
            return;
        }
        // 检查是否有父窗口的截图 API
        if (window.parent && window.parent !== window) {
            try {
                // 调试：打印可用的 API
                console.log('[ImageUploader] 检查父窗口 Zotero 对象...');
                console.log('[ImageUploader] window.parent.Zotero:', !!window.parent.Zotero);
                console.log('[ImageUploader] window.parent.Zotero?.AIChat:', !!window.parent.Zotero?.AIChat);
                console.log('[ImageUploader] window.parent.Zotero?.AIChat?.startScreenshot:', !!window.parent.Zotero?.AIChat?.startScreenshot);
                
                // 尝试直接调用父窗口的截图 API
                if (window.parent.Zotero?.AIChat?.startScreenshot) {
                    console.log('[ImageUploader] ✓ 调用父窗口截图 API');
                    setIsWaitingScreenshot(true);
                    window.parent.Zotero.AIChat.startScreenshot((result) => {
                        setIsWaitingScreenshot(false);
                        if (result.success && result.base64) {
                            if (onImageSelect) {
                                onImageSelect({
                                    base64: result.base64,
                                    type: 'screenshot',
                                    name: `screenshot_${Date.now()}.png`,
                                    width: result.width,
                                    height: result.height
                                });
                            }
                            message.success('截图成功');
                        } else if (result.cancelled) {
                            console.log('[ImageUploader] 截图已取消');
                        } else {
                            message.error('截图失败: ' + (result.error || '未知错误'));
                        }
                    });
                    return;
                }
                
                // API 不可用
                console.warn('[ImageUploader] ⚠️ 截图 API 不可用');
                message.warning('截图功能暂不可用，请稍后重试');
                setIsWaitingScreenshot(false);
                
            } catch (error) {
                console.error('[ImageUploader] 无法访问父窗口:', error);
                message.error('截图功能暂不可用');
                setIsWaitingScreenshot(false);
            }
        } else {
            // 没有父窗口
            message.warning('当前环境不支持截图功能');
        }
    }, [onImageSelect, disabled, disabledTitle]);

    return (
        <>
            {/* 隐藏的文件输入 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            {/* 上传图片按钮 */}
            <Button
                type="text"
                icon={<PictureOutlined />}
                onClick={handleUploadClick}
                title={disabled ? (disabledTitle || '当前模型不支持带图') : '上传图片'}
                disabled={disabled}
                style={{ ...iconStyle, opacity: disabled ? 0.45 : 1 }}
            />

            {/* 截图按钮 */}
            <Button
                type="text"
                icon={<ScissorOutlined />}
                onClick={startScreenshot}
                loading={isWaitingScreenshot}
                title={disabled ? (disabledTitle || '当前模型不支持带图') : '截图'}
                disabled={disabled}
                style={{ ...iconStyle, opacity: disabled ? 0.45 : 1 }}
            />
        </>
    );
};

export default ImageUploader;
