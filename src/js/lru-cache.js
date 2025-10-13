// 新文件：src/js/lru-cache.js
'use strict';
console.log('📜 lru-cache.js 开始加载...');

/**
 * LRU 缓存实现
 * 用于文件树节点的内存优化
 */
class LRUCache {
    constructor(maxSize = 500) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    
    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        // 移到末尾（表示最近使用）
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        
        // 超过容量时删除最旧的项
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }
    
    clear() {
        this.cache.clear();
    }
    
    has(key) {
        return this.cache.has(key);
    }
    
    delete(key) {
        return this.cache.delete(key);
    }
    
    get size() {
        return this.cache.size;
    }
}

// 导出到全局
window.LRUCache = LRUCache;

console.log('✅ lru-cache.js 加载完成');