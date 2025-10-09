# CheetahNote - Milkdown 集成指南

## 📦 第一步：安装依赖

### 1. 确保已安装 Node.js 和 npm

```bash
node --version  # 应该 >= 16.0.0
npm --version   # 应该 >= 8.0.0
```

### 2. 安装 Milkdown 依赖

在项目根目录执行：

```bash
npm install @milkdown/core@^7.3.6 \
            @milkdown/prose@^7.3.6 \
            @milkdown/ctx@^7.3.6 \
            @milkdown/transformer@^7.3.6 \
            @milkdown/preset-commonmark@^7.3.6 \
            @milkdown/preset-gfm@^7.3.6 \
            @milkdown/plugin-listener@^7.3.6 \
            @milkdown/plugin-history@^7.3.6 \
            @milkdown/plugin-clipboard@^7.3.6 \
            @milkdown/plugin-cursor@^7.3.6 \
            @milkdown/utils@^7.3.6 \
            @milkdown/theme-nord@^7.3.6
```

或者使用 yarn：

```bash
yarn add @milkdown/core@^7.3.6 @milkdown/prose@^7.3.6 ...
```

---

## 🔧 第二步：配置模块化系统

### 选项 A：使用原生 ES 模块（推荐）

1. **更新 `tauri.conf.json`** 以支持 ES 模块：

```json
{
  "build": {
    "devUrl": "http://localhost:1420",
    "frontendDist": "../src"
  }
}
```

2. **在 `index.html` 中使用 `type="module"`**：

```html
<script type="module" src="js/milkdown-editor.js"></script>
```

### 选项 B：使用打包工具（如 Vite）

如果您希望更好的性能和自动依赖管理：

```bash
npm install vite --save-dev
```

创建 `vite.config.js`：

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 1420,
  },
});
```

更新 `package.json` 脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 📁 第三步：组织文件结构

确保您的项目结构如下：

```
cheetah-note/
├── src/
│   ├── index.html
│   ├── css/
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── themes.css
│   │   ├── utils.css
│   │   └── milkdown-theme.css ⭐ (新增)
│   ├── js/
│   │   ├── app.js
│   │   ├── editor.js (更新)
│   │   ├── theme.js (更新)
│   │   ├── milkdown-editor.js ⭐ (新增)
│   │   └── ... (其他文件)
│   └── vendor/
│       └── vis/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
├── package.json (更新)
└── README.md
```

---

## 🚀 第四步：验证安装

### 1. 启动开发服务器

```bash
# 如果使用原生开发服务器
npm run start:dev-server

# 或者如果使用 Vite
npm run dev
```

### 2. 启动 Tauri 应用

在另一个终端：

```bash
npm run dev
# 或
cargo tauri dev
```

### 3. 检查编辑器

打开应用后：
- 点击左侧的"打开"按钮选择一个笔记文件夹
- 点击任意 `.md` 文件
- 您应该看到一个所见即所得的编辑器界面
- 尝试输入 Markdown 语法（如 `# 标题`），应该立即渲染

---

## 🎨 第五步：自定义主题

### 调整浅色主题

编辑 `src/css/milkdown-theme.css`：

```css
#milkdown-editor.theme-light {
    background-color: #ffffff;
    color: #2c3e50;
}

#milkdown-editor.theme-light h1 {
    color: #your-color; /* 自定义标题颜色 */
}
```

### 调整深色主题

```css
#milkdown-editor.theme-dark {
    background-color: #2b2622;
    color: #e8e6e3;
}
```

### 测试主题切换

点击应用右上角的主题切换按钮（🌙/☀️），编辑器应该平滑切换主题。

---

## 🐛 故障排查

### 问题 1：编辑器不显示

**检查点：**
1. 浏览器控制台有无错误？
2. `window.milkdownEditor` 是否定义？
3. 确认 `#milkdown-editor` 元素存在

**解决方案：**
```javascript
// 在浏览器控制台执行
console.log(window.milkdownEditor);
console.log(document.querySelector('#milkdown-editor'));
```

### 问题 2：模块导入失败

**错误信息：** `Cannot use import statement outside a module`

**解决方案：**
确保在 `index.html` 中使用：
```html
<script type="module" src="js/milkdown-editor.js"></script>
```

### 问题 3：样式不生效

**检查点：**
1. `milkdown-theme.css` 是否正确引入？
2. 主题类是否正确应用到容器上？

**解决方案：**
```javascript
// 在控制台检查
const editor = document.querySelector('#milkdown-editor');
console.log(editor.classList); // 应包含 'theme-light' 或 'theme-dark'
```

### 问题 4：保存功能不工作

**检查点：**
1. `getMarkdown()` 是否返回内容？
2. Rust 后端是否收到保存请求？

**解决方案：**
```javascript
// 测试导出
const markdown = window.milkdownEditor.getMarkdown();
console.log(markdown);
```

---

## ✅ 验收清单

完成以下所有项即表示集成成功：

- [ ] npm 依赖全部安装无错
- [ ] 应用启动无报错
- [ ] 编辑器显示并可以输入
- [ ] Markdown 语法实时渲染（如 `# 标题` 立即变大）
- [ ] 文件打开时内容正确加载
- [ ] `Ctrl+S` 保存功能正常
- [ ] 主题切换时编辑器样式同步变化
- [ ] 表格、代码块、任务列表等 GFM 语法正常工作
- [ ] 撤销/重做功能正常（`Ctrl+Z` / `Ctrl+Y`）
- [ ] 复制粘贴功能正常

---

## 📚 进阶功能（可选）

### 添加数学公式支持

```bash
npm install @milkdown/plugin-math
```

```javascript
import { math } from '@milkdown/plugin-math';
import '@milkdown/plugin-math/style.css';

Editor.make()
  .use(math)
  .create();
```

### 添加图表支持

```bash
npm install @milkdown/plugin-diagram
```

### 添加自定义快捷键

```javascript
import { keymap } from '@milkdown/plugin-keymap';

Editor.make()
  .config(ctx => {
    ctx.update(keymapCtx, prev => ({
      ...prev,
      'Mod-s': () => handleSaveFile(), // 自定义保存快捷键
    }));
  })
  .create();
```

---

## 🎯 性能优化建议

1. **懒加载编辑器**：只在用户打开文件时才初始化编辑器
2. **虚拟滚动**：对超大文件使用虚拟滚动
3. **防抖保存**：避免频繁写入磁盘

```javascript
const debouncedSave = debounce(handleSaveFile, 1000);
milkdownEditor.init('#milkdown-editor', debouncedSave);
```

---

## 📞 获取帮助

- **Milkdown 官方文档**：https://milkdown.dev
- **GitHub Issues**：https://github.com/Milkdown/milkdown/issues
- **Discord 社区**：https://discord.gg/milkdown

---

完成本指南后，您的 CheetahNote 将拥有一个现代化、高性能的所见即所得 Markdown 编辑器！🎉