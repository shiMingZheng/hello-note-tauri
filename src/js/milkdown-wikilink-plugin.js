// src/js/milkdown-wikilink-plugin.js
'use strict';

import { $ctx, $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

console.log('📜 milkdown-wikilink-plugin.js 开始加载...');

const wikilinkPluginKey = new PluginKey('wikilink');

/**
 * 查找文档中的所有 Wikilink
 */
function findWikilinks(doc) {
    const decorations = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    
    doc.descendants((node, pos) => {
        if (node.isText && node.text) {
            let match;
            while ((match = regex.exec(node.text)) !== null) {
                const from = pos + match.index;
                const to = from + match[0].length;
                const linkText = match[1];
                
                decorations.push(
                    Decoration.inline(from, to, {
                        class: 'milkdown-wikilink',
                        'data-target': linkText
                    })
                );
            }
        }
    });
    
    return DecorationSet.create(doc, decorations);
}

/**
 * 创建 Wikilink 装饰插件
 * @param {Function} onWikilinkClick - 点击回调函数
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
                }
            }
        });
    });
}

console.log('✅ milkdown-wikilink-plugin.js 加载完成');