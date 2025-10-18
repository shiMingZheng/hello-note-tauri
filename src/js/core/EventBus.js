// src/js/core/EventBus.js
// 事件总线 - 解耦模块间通信

'use strict';

console.log('📜 EventBus.js 开始加载...');

class EventBus {
    constructor() {
        if (EventBus.instance) {
            return EventBus.instance;
        }
        
        this.events = new Map();
        EventBus.instance = this;
        
        console.log('✅ EventBus 单例创建完成');
    }
    
    /**
     * 订阅事件
     * @param {string} eventName - 事件名称
     * @param {Function} callback - 回调函数
     * @returns {Function} 取消订阅函数
     */
    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        
        this.events.get(eventName).push(callback);
        console.log(`📡 订阅事件: ${eventName}`);
        
        // 返回取消订阅函数
        return () => this.off(eventName, callback);
    }
    
    /**
     * 取消订阅
     * @param {string} eventName - 事件名称
     * @param {Function} callback - 回调函数
     */
    off(eventName, callback) {
        if (!this.events.has(eventName)) return;
        
        const callbacks = this.events.get(eventName);
        const index = callbacks.indexOf(callback);
        
        if (index > -1) {
            callbacks.splice(index, 1);
            console.log(`🔇 取消订阅: ${eventName}`);
        }
        
        // 如果没有订阅者了，删除事件
        if (callbacks.length === 0) {
            this.events.delete(eventName);
        }
    }
    
    /**
     * 发布事件
     * @param {string} eventName - 事件名称
     * @param {*} data - 事件数据
     */
    emit(eventName, data) {
        if (!this.events.has(eventName)) {
            console.warn(`⚠️ 没有订阅者监听事件: ${eventName}`);
            return;
        }
        
        const callbacks = this.events.get(eventName);
        console.log(`📤 发布事件: ${eventName}`, data);
        
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`❌ 事件处理器执行失败 [${eventName}]:`, error);
            }
        });
    }
    
    /**
     * 一次性订阅（触发后自动取消）
     * @param {string} eventName - 事件名称
     * @param {Function} callback - 回调函数
     */
    once(eventName, callback) {
        const onceWrapper = (data) => {
            callback(data);
            this.off(eventName, onceWrapper);
        };
        
        this.on(eventName, onceWrapper);
    }
    
    /**
     * 清空所有订阅
     */
    clear() {
        this.events.clear();
        console.log('🧹 清空所有事件订阅');
    }
    
    /**
     * 获取事件列表（调试用）
     */
    getEventList() {
        return Array.from(this.events.keys());
    }
}

// 导出单例实例
export const eventBus = new EventBus();

console.log('✅ EventBus.js 加载完成');
