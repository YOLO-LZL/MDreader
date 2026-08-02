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

前端保留原始 Markdown 文本，渲染器负责生成阅读视图，文件访问由 Tauri 插件隔离。后续可以在同一文档状态模型上接入 CodeMirror 6 源码编辑，或使用 ProseMirror/Milkdown 演进为所见即所得编辑。

## 检查

```bash
npm run lint
npm run build
```

当前环境已安装 Rust MSVC toolchain 和 Visual Studio Build Tools。`npm run tauri:build` 已验证可生成 Windows x64 安装包：NSIS `.exe` 和 MSI `.msi`。
