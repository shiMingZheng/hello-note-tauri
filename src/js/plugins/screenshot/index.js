// src/js/plugins/screenshot/index.js
// CheetahNote 截图插件

'use strict';

/**
 * 截图插件类
 */
export default class ScreenshotPlugin {
    constructor(context) {
        this.context = context;
        this.menuId = null;
    }

    /**
     * 插件激活时调用
     */
    async activate() {
        console.log('🔌 截图插件激活');

        // 添加工具栏按钮
        this.context.menu.addItem('tools', {
            id: 'screenshot',
            label: '📷',
            accelerator: 'Ctrl+Shift+A',
            onClick: () => this.handleCapture()
        });

        console.log('✅ 截图插件已激活');
    }

    /**
     * 插件停用时调用
     */
    async deactivate() {
        console.log('🔌 截图插件停用');

        // 移除菜单项
        if (this.menuId) {
            this.context.menu.removeItem('screenshot');
        }

        console.log('✅ 截图插件已停用');
    }

    /**
     * 处理截图操作
     */
    async handleCapture() {
        console.log('📸 开始截图流程...');

        try {
            // 1. 调用 Rust 后端截图
            this.context.ui.showToast('正在截图...');

            const result = await this.context.invoke('capture_screen', {
				params: {  // ⭐ 关键：需要包装在 params 对象中
					mode: 'fullscreen',
					region: null
				}
			});

            console.log('✅ 截图成功:', result.width, 'x', result.height);

            // 2. 打开标注界面
            const annotateResult = await this.context.ui.openModal(
                'js/plugins/screenshot/annotate.html',
                {
                    imageData: result.data,
                    width: result.width,
                    height: result.height
                }
            );

            // 3. 如果用户确认，保存并插入图片
            if (annotateResult && annotateResult.confirmed) {
                await this.insertImage(annotateResult.imageData);
            }

        } catch (error) {
            console.error('❌ 截图失败:', error);
            this.context.ui.showError('截图失败: ' + error);
        }
    }

    /**
     * 插入图片到编辑器
     */
    async insertImage(imageData) {
        try {
            // 生成文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `screenshot-${timestamp}.png`;

            // 获取工作区路径
            const rootPath = this.context.workspace.getRootPath();
            if (!rootPath) {
                this.context.ui.showError('请先打开一个笔记仓库');
                return;
            }

            // 构造保存路径（保存到 assets 目录）
            const savePath = `${rootPath}/assets/${fileName}`;

            // 保存图片
            this.context.ui.showToast('正在保存图片...');
            const absolutePath = await this.context.invoke('save_image', {
                data: imageData,
                path: savePath
            });

            console.log('✅ 图片保存成功:', absolutePath);

            // 插入到编辑器
            const relativePath = `assets/${fileName}`;
            this.context.editor.insertImage(relativePath, '截图');

            this.context.ui.showToast('截图已插入笔记');

        } catch (error) {
            console.error('❌ 保存图片失败:', error);
            this.context.ui.showError('保存图片失败: ' + error);
        }
    }
}