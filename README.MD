

### 开发环境命令

```bash
# 1. 进入项目目录
cd cheetah-note

# 2. 安装前端依赖 (如果使用 npm)
npm install

# 3. 开发模式运行 (热重载)
cargo tauri dev

# 或者使用 npm 脚本
npm run tauri dev
```

### 构建生产版本

```bash
# 构建最终的可执行文件
cargo tauri build

# 构建结果位置:
# Windows: src-tauri/target/release/bundle/
# macOS: src-tauri/target/release/bundle/macos/
# Linux: src-tauri/target/release/bundle/
```

### 额外的开发工具命令

```bash
# 检查 Tauri 环境
cargo tauri info

# 清理构建缓存
cargo clean

# 格式化 Rust 代码
cargo fmt

# 检查 Rust 代码
cargo check

# 运行 Rust 测试
cargo test

# 查看 Tauri CLI 帮助
cargo tauri --help
```

## 📋 项目特点总结

### ✅ 已实现的核心特性

1. **极简架构**: 纯原生 Web 技术，无框架依赖
2. **模块化设计**: 清晰的前后端分离结构  
3. **性能监控**: 内置启动时间和运行时性能监控
4. **错误处理**: 完善的错误处理和用户反馈机制
5. **键盘快捷键**: 支持常用的键盘操作
6. **响应式设计**: 适配不同屏幕尺寸
7. **无障碍支持**: 遵循 Web 无障碍标准

### 🚀 性能优化策略

1. **Rust 编译优化**: release 模式下启用最高级别优化
2. **依赖最小化**: 只添加必需的依赖项
3. **CSS 硬件加速**: 使用 transform 和 opacity 动画
4. **事件处理优化**: 避免频繁的 DOM 操作
5. **内存管理**: 合理的状态管理和清理机制

### 📁 下一步扩展方向

1. **数据存储**: 集成 SQLite 数据库
2. **Markdown 支持**: 添加 pulldown-cmark 解析器
3. **文件监控**: 实现文件系统变化监控
4. **全文搜索**: 集成 tantivy 搜索引擎
5. **主题系统**: 支持明暗主题切换

这个初始版本为后续的功能扩展奠定了坚实的基础，严格遵循了高性能、低资源占用的设计目标。