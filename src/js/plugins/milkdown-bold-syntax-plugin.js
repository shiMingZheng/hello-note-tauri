// src/js/milkdown-bold-syntax-plugin.js
'use strict';

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

console.log('📜 milkdown-bold-syntax-plugin.js 开始加载...');

const boldSyntaxKey = new PluginKey('boldSyntax');

/**
 * 查找粗体标记的完整范围
 */
function findBoldMarkRange(doc, pos) {
    const $pos = doc.resolve(pos);
    const marks = $pos.marks();
    const strongMark = marks.find(m => m.type.name === 'strong');
    
    if (!strongMark) {
        return null;
    }
    
    // 向前查找粗体开始位置
    let start = pos;
    while (start > 0) {
        const $prev = doc.resolve(start - 1);
        const prevMarks = $prev.marks();
        const hasPrevStrong = prevMarks.some(m => m.type.name === 'strong');
        if (!hasPrevStrong) break;
        start--;
    }
    
    // 向后查找粗体结束位置
    let end = pos;
    while (end < doc.content.size) {
        const $next = doc.resolve(end);
        const nextMarks = $next.marks();
        const hasNextStrong = nextMarks.some(m => m.type.name === 'strong');
        if (!hasNextStrong) break;
        end++;
    }
    
    return { from: start, to: end };
}

/**
 * 创建粗体语法装饰器
 */
function createBoldSyntaxDecorations(doc, activeRange = null) {
    if (!activeRange) {
        return DecorationSet.empty;
    }
    
    const decorations = [];
    
    console.log('🎨 创建粗体语法装饰器，范围:', activeRange);

    // 1. 在粗体文本前面添加 ** 标记（Widget）
    decorations.push(
        Decoration.widget(activeRange.from, () => {
            const span = document.createElement('span');
            span.className = 'syntax-marker bold-marker-left';
            span.textContent = '**';
            span.contentEditable = 'false'; // 标记本身不可编辑，但可以被选中删除
            span.style.userSelect = 'text';
            span.style.color = 'var(--primary-color)';
            span.style.opacity = '0.7';
            span.style.fontWeight = 'normal';
            span.style.marginRight = '2px';
            return span;
        }, { 
            side: -1, // 在位置左侧显示
            key: 'bold-left-' + activeRange.from 
        })
    );
    
    // 2. 在粗体文本后面添加 ** 标记（Widget）
    decorations.push(
        Decoration.widget(activeRange.to, () => {
            const span = document.createElement('span');
            span.className = 'syntax-marker bold-marker-right';
            span.textContent = '**';
            span.contentEditable = 'false';
            span.style.userSelect = 'text';
            span.style.color = 'var(--primary-color)';
            span.style.opacity = '0.7';
            span.style.fontWeight = 'normal';
            span.style.marginLeft = '2px';
            return span;
        }, { 
            side: 1, // 在位置右侧显示
            key: 'bold-right-' + activeRange.to 
        })
    );
    
    // 3. 给粗体文本添加高亮背景
    decorations.push(
        Decoration.inline(activeRange.from, activeRange.to, {
            class: 'bold-syntax-active',
            style: 'background-color: rgba(74, 144, 226, 0.12); border-radius: 3px; padding: 2px 4px;'
        })
    );
    
    console.log('✅ 创建了', decorations.length, '个装饰器');
    
    return DecorationSet.create(doc, decorations);
}

/**
 * 创建粗体语法插件
 */
export const boldSyntaxPlugin = () => $prose(() => {
    let activeRange = null;

    return new Plugin({
        key: boldSyntaxKey,
        
        state: {
            init(_, { doc }) {
                return DecorationSet.empty;
            },
            
            apply(tr, oldSet, oldState, newState) {
                const meta = tr.getMeta(boldSyntaxKey);
                
                if (meta) {
                    if (meta.action === 'setActive') {
                        activeRange = meta.range;
                        console.log('🔓 激活粗体:', activeRange);
                    } else if (meta.action === 'clearActive') {
                        activeRange = null;
                        console.log('🔒 清除激活');
                    }
                }
                
                // 文档改变或状态改变时重新计算
                if (tr.docChanged || meta) {
                    return createBoldSyntaxDecorations(newState.doc, activeRange);
                }
                
                return oldSet.map(tr.mapping, tr.doc);
            },
        },
        
        props: {
            decorations(state) {
                return this.getState(state);
            },
            
            // 处理点击事件
			handleClick(view, pos, event) {
				// ⭐ 新增：源码模式下完全禁用插件
				const editorManager = window.milkdownEditor;
				if (editorManager && editorManager.isSourceMode) {
					console.log('🚫 源码模式，禁用粗体语法插件');
					return false;
				}
				
				// 检查是否点击了语法标记
				if (event.target.classList.contains('syntax-marker')) {
					console.log('🎯 点击了语法标记，允许选中');
					return false;
				}
				
				const { doc, tr } = view.state;
				const $pos = doc.resolve(pos);
				const marks = $pos.marks();
				const hasStrong = marks.some(m => m.type.name === 'strong');
				
				if (hasStrong) {
					console.log('💪 点击了粗体文本');
					const range = findBoldMarkRange(doc, pos);
					
					if (range) {
						const transaction = tr.setMeta(boldSyntaxKey, {
							action: 'setActive',
							range: range
						});
						view.dispatch(transaction);
						return true;
					}
				} else {
					// 点击其他位置，清除激活状态
					if (activeRange !== null) {
						const transaction = tr.setMeta(boldSyntaxKey, {
							action: 'clearActive'
						});
						view.dispatch(transaction);
					}
				}
				
				return false;
			},
            
            // 处理键盘事件
            handleKeyDown(view, event) {
                // ⭐ 新增：源码模式下完全禁用插件
				const editorManager = window.milkdownEditor;
				if (editorManager && editorManager.isSourceMode) {
					return false;
				}
				
				// ESC 退出编辑
				if (event.key === 'Escape' && activeRange !== null) {
					console.log('⌨️ ESC 退出');
					const { tr } = view.state;
					const transaction = tr.setMeta(boldSyntaxKey, {
						action: 'clearActive'
					});
					view.dispatch(transaction);
					return true;
				}
                
                // Backspace 或 Delete 删除粗体标记
                if ((event.key === 'Backspace' || event.key === 'Delete') && activeRange !== null) {
                    const { state } = view;
                    const { selection } = state;
                    
                    // 如果光标在粗体范围的边界，移除粗体格式
                    if (selection.from === activeRange.from || selection.from === activeRange.to) {
                        const strongType = state.schema.marks.strong;
                        const tr = state.tr.removeMark(
                            activeRange.from,
                            activeRange.to,
                            strongType
                        );
                        view.dispatch(tr);
                        
                        // 清除激活状态
                        const clearTr = view.state.tr.setMeta(boldSyntaxKey, {
                            action: 'clearActive'
                        });
                        view.dispatch(clearTr);
                        
                        return true;
                    }
                }
                
                return false;
            }
        },
    });
});

console.log('✅ milkdown-bold-syntax-plugin.js 加载完成');