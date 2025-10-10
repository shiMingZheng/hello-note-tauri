// src/js/plugin-manager.js
// CheetahNote 插件管理器

'use strict';
console.log('📜 plugin-manager.js 开始加载...');

/**
 * 插件管理器
 * 负责插件的加载、卸载、生命周期管理
 */
class PluginManager {
    constructor() {
        this.plugins = new Map();           // 已加载的插件 Map<pluginId, pluginInstance>
        this.pluginConfigs = new Map();     // 插件配置 Map<pluginId, manifest>
        this.context = null;                // 插件上下文（将在初始化时设置）
        this.enabled = new Set();           // 已启用的插件 ID
    }

    /**
     * 初始化插件系统
     * @param {PluginContext} context - 插件上下文
     */
    async init(context) {
        console.log('🎯 初始化插件管理器...');
        this.context = context;
        
        // 从 localStorage 恢复启用状态
        this.restoreEnabledPlugins();
        
        // 自动加载内置插件
        await this.loadBuiltInPlugins();
        
        console.log('✅ 插件管理器初始化完成');
    }

    /**
     * 加载内置插件
     */
    async loadBuiltInPlugins() {
        const builtInPlugins = [
            'screenshot'  // 截图插件
        ];
        
        for (const pluginId of builtInPlugins) {
            try {
                await this.loadPlugin(pluginId);
            } catch (error) {
                console.error(`❌ 加载插件失败: ${pluginId}`, error);
            }
        }
    }

    /**
     * 加载插件
     * @param {string} pluginId - 插件 ID
     */
    async loadPlugin(pluginId) {
        if (this.plugins.has(pluginId)) {
            console.warn(`⚠️ 插件已加载: ${pluginId}`);
            return;
        }

        console.log(`📦 加载插件: ${pluginId}`);

        try {
            // 1. 加载 manifest.json
            const manifestUrl = `js/plugins/${pluginId}/manifest.json`;
            const manifestResponse = await fetch(manifestUrl);
            if (!manifestResponse.ok) {
                throw new Error(`无法加载 manifest: ${manifestResponse.status}`);
            }
            const manifest = await manifestResponse.json();
            
            // 2. 验证 manifest
            if (!this.validateManifest(manifest)) {
                throw new Error('manifest 格式无效');
            }
            
            this.pluginConfigs.set(pluginId, manifest);

            // 3. 动态导入插件模块
            const pluginModule = await import(`./plugins/${pluginId}/index.js`);
            const PluginClass = pluginModule.default;
            
            if (!PluginClass) {
                throw new Error('插件未导出默认类');
            }

            // 4. 创建插件实例
            const pluginInstance = new PluginClass(this.context);
            this.plugins.set(pluginId, pluginInstance);

            // 5. 如果插件已启用，激活它
            if (this.enabled.has(pluginId)) {
                await this.activatePlugin(pluginId);
            }

            console.log(`✅ 插件加载成功: ${manifest.name}`);
        } catch (error) {
            console.error(`❌ 加载插件失败: ${pluginId}`, error);
            throw error;
        }
    }

    /**
     * 激活插件
     * @param {string} pluginId - 插件 ID
     */
    async activatePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`插件未加载: ${pluginId}`);
        }

        console.log(`🔌 激活插件: ${pluginId}`);

        try {
            if (typeof plugin.activate === 'function') {
                await plugin.activate(this.context);
            }
            
            this.enabled.add(pluginId);
            this.saveEnabledPlugins();
            
            console.log(`✅ 插件激活成功: ${pluginId}`);
        } catch (error) {
            console.error(`❌ 激活插件失败: ${pluginId}`, error);
            throw error;
        }
    }

    /**
     * 停用插件
     * @param {string} pluginId - 插件 ID
     */
    async deactivatePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`插件未加载: ${pluginId}`);
        }

        console.log(`🔌 停用插件: ${pluginId}`);

        try {
            if (typeof plugin.deactivate === 'function') {
                await plugin.deactivate();
            }
            
            this.enabled.delete(pluginId);
            this.saveEnabledPlugins();
            
            console.log(`✅ 插件停用成功: ${pluginId}`);
        } catch (error) {
            console.error(`❌ 停用插件失败: ${pluginId}`, error);
            throw error;
        }
    }

    /**
     * 卸载插件
     * @param {string} pluginId - 插件 ID
     */
    async unloadPlugin(pluginId) {
        if (!this.plugins.has(pluginId)) {
            console.warn(`⚠️ 插件未加载: ${pluginId}`);
            return;
        }

        console.log(`🗑️ 卸载插件: ${pluginId}`);

        try {
            // 先停用
            if (this.enabled.has(pluginId)) {
                await this.deactivatePlugin(pluginId);
            }

            // 删除插件
            this.plugins.delete(pluginId);
            this.pluginConfigs.delete(pluginId);

            console.log(`✅ 插件卸载成功: ${pluginId}`);
        } catch (error) {
            console.error(`❌ 卸载插件失败: ${pluginId}`, error);
            throw error;
        }
    }

    /**
     * 切换插件启用状态
     * @param {string} pluginId - 插件 ID
     */
    async togglePlugin(pluginId) {
        if (this.enabled.has(pluginId)) {
            await this.deactivatePlugin(pluginId);
        } else {
            await this.activatePlugin(pluginId);
        }
    }

    /**
     * 获取所有插件列表
     * @returns {Array} 插件列表
     */
    getPluginList() {
        const list = [];
        
        for (const [pluginId, manifest] of this.pluginConfigs) {
            list.push({
                id: pluginId,
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                author: manifest.author,
                enabled: this.enabled.has(pluginId)
            });
        }
        
        return list;
    }

    /**
     * 验证 manifest 格式
     * @param {Object} manifest - 插件配置
     * @returns {boolean} 是否有效
     */
    validateManifest(manifest) {
        return !!(
            manifest.id &&
            manifest.name &&
            manifest.version &&
            manifest.entry
        );
    }

    /**
     * 保存启用的插件列表到 localStorage
     */
    saveEnabledPlugins() {
        try {
            const enabledArray = Array.from(this.enabled);
            localStorage.setItem('cheetah_enabled_plugins', JSON.stringify(enabledArray));
        } catch (error) {
            console.warn('⚠️ 保存插件状态失败:', error);
        }
    }

    /**
     * 从 localStorage 恢复启用的插件列表
     */
    restoreEnabledPlugins() {
        try {
            const saved = localStorage.getItem('cheetah_enabled_plugins');
            if (saved) {
                const enabledArray = JSON.parse(saved);
                this.enabled = new Set(enabledArray);
                console.log('🔄 恢复插件启用状态:', enabledArray);
            } else {
                // 默认启用所有内置插件
                this.enabled.add('screenshot');
            }
        } catch (error) {
            console.warn('⚠️ 恢复插件状态失败:', error);
        }
    }
}

// 创建全局插件管理器实例
const pluginManager = new PluginManager();

// 导出到全局
window.pluginManager = pluginManager;

console.log('✅ plugin-manager.js 加载完成');