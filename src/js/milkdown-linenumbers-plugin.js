// src/js/milkdown-linenumbers-plugin.js
'use strict';

import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

console.log('📜 milkdown-linenumbers-plugin.js 开始加载...');

const lineNumbersKey = new PluginKey('MILKDOWN_LINE_NUMBERS');

// 计算行数（改进逻辑：深入列表项计算段落）并创建 Decorations
function createLineNumberDecorations(doc) {
    const decorations = [];
    let lineNumber = 1;

    // 使用 recursive descent 遍历文档节点
    function traverse(node, pos) {
        // 1. 对于段落(paragraph)和标题(heading)，直接添加行号
        //    (可以根据需要添加更多块类型，如 code_block, blockquote)
        if ((node.type.name === 'paragraph' || node.type.name.startsWith('heading')) && node.content.size > 0) {
            const lineNoElement = document.createElement('div');
            lineNoElement.className = 'line-number';
            lineNoElement.textContent = lineNumber.toString();
            decorations.push(Decoration.widget(pos + 1, lineNoElement, { side: -1 }));
            lineNumber++;
        }
        // 2. 对于列表项(list_item)，不直接为其添加行号，而是递归其内容
        else if (node.type.name === 'list_item') {
             // 对于列表项，如果它内部有内容，则递归处理
             // 不为列表项本身添加行号，而是为其内部的段落等添加
             node.content.forEach((childNode, offset) => {
                 traverse(childNode, pos + 1 + offset); // 递归子节点，pos需要+1跳过<li>本身
             });
             // 如果列表项为空，也计为一行（可选，根据需要决定）
             if (node.content.size === 0) {
                 const lineNoElement = document.createElement('div');
                 lineNoElement.className = 'line-number';
                 lineNoElement.textContent = lineNumber.toString();
                 decorations.push(Decoration.widget(pos + 1, lineNoElement, { side: -1 }));
                 lineNumber++;
             }
        }
         // 3. 对于其他类型的块级节点（如代码块、引用块），如果希望它们有单独行号，也在这里处理
        else if (node.isBlock && node.type.name !== 'bullet_list' && node.type.name !== 'ordered_list') {
             // 如果不是段落、标题、列表项，但仍是块，且内容不为空，则也给它一个行号
             // (排除列表容器本身 bullet_list 和 ordered_list)
             if (node.content.size > 0) {
                 const lineNoElement = document.createElement('div');
                 lineNoElement.className = 'line-number';
                 lineNoElement.textContent = lineNumber.toString();
                 decorations.push(Decoration.widget(pos + 1, lineNoElement, { side: -1 }));
                 lineNumber++;
             }
             // 对于其他容器类型的块，递归其内容
             else if (node.content.size > 0) {
                 node.content.forEach((childNode, offset) => {
                     traverse(childNode, pos + 1 + offset);
                 });
             }
        }
        // 4. 如果当前节点是容器，继续递归其子节点
        else if (node.content.size > 0) {
             node.content.forEach((childNode, offset) => {
                // 对于非块级容器，直接递归，位置是父节点位置+偏移
                traverse(childNode, pos + (node.isBlock ? 1 : 0) + offset);
             });
        }
    }

    // 从文档的根节点开始遍历
    doc.content.forEach((node, pos) => {
        traverse(node, pos);
    });

    return DecorationSet.create(doc, decorations);
}

// 创建插件
export const lineNumbersPlugin = () => $prose(() => {
    return new Plugin({
        key: lineNumbersKey,
        state: {
            init(_, { doc }) {
                // 初始化时创建 Decorations
                return createLineNumberDecorations(doc);
            },
            apply(tr, oldSet) {
                // 当文档内容改变时，重新计算 Decorations
                return tr.docChanged ? createLineNumberDecorations(tr.doc) : oldSet;
            },
        },
        props: {
            decorations(state) {
                // 将 state 中的 Decorations 应用到视图
                return this.getState(state);
            },
        },
    });
});

console.log('✅ milkdown-linenumbers-plugin.js 加载完成');