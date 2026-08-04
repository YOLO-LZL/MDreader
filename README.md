# MDreader

一个 Windows 优先、离线优先的本地 Markdown 阅读器 MVP，界面借鉴 Typora 的克制阅读体验。

## 已实现

- 打开或拖拽 `.md`、`.markdown`、`.mdown` 文件
- CommonMark + GitHub Flavored Markdown
- 表格、任务列表、代码块和语法高亮
- 自动生成文档目录并支持平滑跳转
- 浅色/深色主题
- 浏览器文件选择兜底，以及 Tauri 原生文件对话框
- Tauri 文件关联配置，可将 Markdown 文件交给 MDreader 打开
- Milkdown 所见即所得编辑：阅读/编辑模式、Markdown 快捷输入和格式工具栏
- 撤销/重做、标题、强调、列表、任务列表、引用、代码块、链接和图片
- Tauri 原地保存、浏览器下载副本，以及保存前的未保存修改确认

## 编辑与保存

点击文档上方的“编辑”进入所见即所得模式。编辑器仍以 Markdown 作为持久化格式，GFM 表格、任务列表、围栏代码和相对图片会在保存后继续保持语义。

- `Ctrl+S` 保存当前文档；没有原文件路径时会打开“另存为”对话框。
- 浏览器模式不能覆盖本地文件，保存会下载一个 Markdown 副本。
- 打开文件、拖放文件、文件关联事件和关闭窗口都会在存在修改时提供“保存 / 放弃 / 取消”。
- `Ctrl+Z` 和 `Ctrl+Shift+Z` 由编辑器处理；工具栏按钮也支持撤销和重做。

## 开发

```bash
npm install
npm run dev
```

浏览器预览地址通常是 `http://127.0.0.1:5173/`。

## Tauri 开发与打包

```bash
npm run tauri:dev
npm run tauri:build
```

Windows 打包需要 Rust、Cargo 和 Visual Studio Build Tools（MSVC + Windows SDK）。构建目标配置为 NSIS `.exe` 和 MSI 安装包。

## 架构说明

前端以 `content` 和 `persistedContent` 维护唯一文档状态，Milkdown/ProseMirror 同时负责阅读排版和编辑，并在事务后序列化回 Markdown。文件访问由 Tauri 命令隔离；写入先落到同目录临时文件，再替换目标文件。

## 检查

```bash
npm run lint
npm run test
npm run build
```

当前环境已安装 Rust MSVC toolchain 和 Visual Studio Build Tools。`npm run tauri:build` 可生成 Windows x64 安装包：NSIS `.exe` 和 MSI `.msi`。
