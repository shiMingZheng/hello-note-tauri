// src/js/milkdown-wikilink-plugin.js
// CheetahNote - Milkdown Wikilink 插件

'use strict';

import { $ctx, $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

const wikilinkPluginKey = new PluginKey('wikilink');

/**
 * 创建 Wikilink 装饰插件
 * 这个插件会扫描文档，找到 [[...]] 并添加样式和点击处理
 */
export function createWikilinkPlugin(onWikilinkClick) {
    return $prose(() => {
        return new Plugin({
            key: wikilinkPluginKey,
            
            state: {
                init(_, { doc }) {
                    return findWikilinks(doc);
                },
                apply(tr, oldState) {
                    return tr.docChanged ? findWikilinks(tr.doc) : oldState;
                }
            },
            
            props: {
                decorations(state) {
                    return this.getState(state);
                },
                
                handleClick(view, pos, event) {
                    // 必须按住 Ctrl/Cmd
                    if (!event.ctrlKey && !event.metaKey) {
                        return false;
                    }
                    
                    const decorations = this.getState(view.state);
                    const decoration = decorations.find(pos, pos);
                    
                    if (decoration.length > 0) {
                        const spec = decoration[0].spec;
                        if (spec && spec.wikilinkTarget) {
                            event.preventDefault();
                            event.stopPropagation();
                            
                            console.log('🔗 Wikilink 点击:', spec.wikilinkTarget);
                            onWikilinkClick(spec.wikilinkTarget);
                            return true;
                        }
                    }
                    
                    return false;
                }
            }
        });
    });
}

/**
 * 查找文档中所有的 Wikilink
 */
function findWikilinks(doc) {
    const decorations = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    
    doc.descendants((node, pos) => {
        if (!node.isText) return;
        
        const text = node.text;
        if (!text) return;
        
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
            const start = pos + match.index;
            const end = start + match[0].length;
            const target = match[1].trim();
            
            // 创建装饰
            const decoration = Decoration.inline(start, end, {
                class: 'wikilink-decoration',
                style: `
                    color: #4a90e2;
                    background-color: rgba(74, 144, 226, 0.1);
                    padding: 1px 4px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-weight: 500;
                `,
                title: `按住 Ctrl/Cmd 点击跳转到: ${target}`
            }, {
                wikilinkTarget: target
            });
            
            decorations.push(decoration);
        }
    });
    
    return DecorationSet.create(doc, decorations);
}