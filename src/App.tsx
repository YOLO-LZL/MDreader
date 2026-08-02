import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  Languages,
  List,
  Moon,
  PanelLeft,
  Sun,
  Upload,
} from 'lucide-react'
import './App.css'

type TocItem = { id: string; label: string; level: number }
type Language = 'zh' | 'en'

const SAMPLE_MARKDOWN_EN = `# Welcome to MDreader

A quiet, local-first Markdown reading space for notes, documentation, and long-form writing.

## Start with a file

Open a **.md** or **.markdown** file from your computer, or drop it anywhere in this window. Your document stays local to this app.

## What is supported

- GitHub Flavored Markdown tables and task lists
- Code blocks with syntax highlighting
- Relative images and links
- A generated outline for quick navigation

> Tip: use the outline on the left to move through a long document.

### A small example

~~~ts
const reading = 'focused'
console.log('Markdown feels ' + reading + ' here.')
~~~

| Feature | Status |
| --- | --- |
| Local files | Ready |
| Themes | Ready |
| Editing | Coming next |
`

const SAMPLE_MARKDOWN_ZH = `# 欢迎使用 MDreader

一个安静、以本地为主的 Markdown 阅读空间，适合笔记、文档和长篇写作。

## 从文件开始

打开电脑中的 **.md** 或 **.markdown** 文件，或者将文件拖到窗口中的任意位置。你的文档始终留在本地。

## 支持的功能

- GitHub Flavored Markdown 表格和任务列表
- 带语法高亮的代码块
- 相对路径图片和链接
- 自动生成目录，快速跳转

> 提示：长文档可以使用左侧目录快速浏览章节。

### 一个小例子

~~~ts
const reading = 'focused'
console.log('Markdown feels ' + reading + ' here.')
~~~

| 功能 | 状态 |
| --- | --- |
| 本地文件 | 已支持 |
| 主题切换 | 已支持 |
| 编辑功能 | 即将推出 |
`

const COPY = {
  en: {
    brandCaption: 'local Markdown',
    openFile: 'Open file',
    openFileTitle: 'Open Markdown file',
    toggleOutline: 'Toggle outline',
    toggleTheme: 'Toggle theme',
    github: 'Project on GitHub',
    outline: 'Outline',
    outlineEmpty: 'Open a document to see its sections.',
    welcome: 'Welcome to MDreader',
    words: 'words',
    dropPrefix: 'Drop a Markdown file here, or',
    browse: 'browse your files',
    localFile: 'Local file',
    previewDocument: 'Preview document',
    markdownUtf8: 'Markdown · UTF-8',
    light: 'Light',
    dark: 'Dark',
    languageTitle: 'Switch language',
    chooseMarkdown: 'Please choose a Markdown file.',
    unableToOpen: 'Unable to open this file.',
  },
  zh: {
    brandCaption: '本地 Markdown',
    openFile: '打开文件',
    openFileTitle: '打开 Markdown 文件',
    toggleOutline: '切换目录',
    toggleTheme: '切换主题',
    github: 'GitHub 项目',
    outline: '目录',
    outlineEmpty: '打开文档后查看章节。',
    welcome: '欢迎使用 MDreader',
    words: '字词',
    dropPrefix: '拖入 Markdown 文件，或',
    browse: '浏览文件',
    localFile: '本地文件',
    previewDocument: '预览文档',
    markdownUtf8: 'Markdown · UTF-8',
    light: '浅色',
    dark: '深色',
    languageTitle: '切换语言',
    chooseMarkdown: '请选择 Markdown 文件。',
    unableToOpen: '无法打开此文件。',
  },
} as const

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isMarkdownPath(path: string) {
  return /\.(md|markdown|mdown)$/i.test(path)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function extractHeadings(markdown: string): TocItem[] {
  const used = new Map<string, number>()
  return markdown
    .split('\n')
    .flatMap((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
      if (!match) return []
      const label = match[2].replace(/[*_`~]/g, '').trim()
      const base = slugify(label) || 'section'
      const count = used.get(base) ?? 0
      used.set(base, count + 1)
      return [{ id: count ? `${base}-${count}` : base, label, level: match[1].length }]
    })
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  return ''
}

function App() {
  const [content, setContent] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<Language>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('mdreader-language') : null
    if (stored === 'zh' || stored === 'en') return stored
    return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  })
  const inputRef = useRef<HTMLInputElement>(null)

  const t = COPY[language]
  const markdown = content || (language === 'zh' ? SAMPLE_MARKDOWN_ZH : SAMPLE_MARKDOWN_EN)
  const toc = useMemo(() => extractHeadings(markdown), [markdown])
  const wordCount = useMemo(() => markdown.trim().split(/\s+/).filter(Boolean).length, [markdown])

  useEffect(() => {
    window.localStorage.setItem('mdreader-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  const loadText = useCallback(async (text: string, name: string, path?: string) => {
    setContent(text)
    setFileName(name)
    setFilePath(path ?? null)
    setError(null)
  }, [])

  const loadPath = useCallback(async (path: string) => {
    if (!isMarkdownPath(path)) {
      setError(t.chooseMarkdown)
      return
    }

    try {
      const text = isTauriRuntime()
        ? await invoke<string>('read_markdown_file', { path })
        : await fetch(path).then((response) => response.text())
      const name = path.split(/[\\/]/).pop() ?? 'Untitled.md'
      await loadText(text, name, path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.unableToOpen)
    }
  }, [loadText, t.chooseMarkdown, t.unableToOpen])

  async function openFile() {
    try {
      setError(null)
      if (isTauriRuntime()) {
        const selected = await openDialog({
          multiple: false,
          directory: false,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
        })
        if (!selected || Array.isArray(selected)) return
        await loadPath(selected)
        return
      }
      inputRef.current?.click()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.unableToOpen)
    }
  }

  async function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await loadText(await file.text(), file.name)
    event.target.value = ''
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (!isMarkdownPath(file.name)) {
      setError(t.chooseMarkdown)
      return
    }
    await loadText(await file.text(), file.name)
  }

  function scrollToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!isTauriRuntime()) return

    let disposed = false
    let unlistenOpenFiles: (() => void) | undefined
    let unlistenDrop: (() => void) | undefined

    void (async () => {
      const initialPaths = await invoke<string[]>('initial_files')
      if (!disposed && initialPaths[0]) await loadPath(initialPaths[0])

      unlistenOpenFiles = await listen<string[]>('open-files', ({ payload }) => {
        if (payload[0]) void loadPath(payload[0])
      })

      unlistenDrop = await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'drop' && payload.paths[0]) void loadPath(payload.paths[0])
      })
    })().catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : t.unableToOpen)
    })

    return () => {
      disposed = true
      unlistenOpenFiles?.()
      unlistenDrop?.()
    }
  }, [language, loadPath, t.unableToOpen])

  return (
    <div className={`app-shell ${theme}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><BookOpen size={17} strokeWidth={2.2} /></div>
          <span>MDreader</span>
          <span className="brand-caption">{t.brandCaption}</span>
        </div>
        <div className="topbar-actions">
          <button className="toolbar-button primary" onClick={openFile} title={t.openFileTitle}>
            <FolderOpen size={16} />
            <span>{t.openFile}</span>
          </button>
          <button className="icon-button" onClick={() => setOutlineOpen((value) => !value)} title={t.toggleOutline}>
            <PanelLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} title={t.toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="language-toggle" onClick={() => setLanguage((value) => value === 'zh' ? 'en' : 'zh')} title={t.languageTitle} aria-label={t.languageTitle}>
            <Languages size={16} />
            <span className={language === 'zh' ? 'active' : ''}>中</span>
            <span className="language-divider">/</span>
            <span className={language === 'en' ? 'active' : ''}>EN</span>
          </button>
          <a className="icon-button" href="https://github.com" target="_blank" rel="noreferrer" title={t.github}>
            <GitBranch size={18} />
          </a>
        </div>
      </header>

      <div className="workspace">
        <aside className={`outline-panel ${outlineOpen ? '' : 'collapsed'}`} aria-label={t.outline}>
          <div className="outline-heading"><List size={15} /><span>{t.outline}</span></div>
          {outlineOpen && (toc.length ? (
            <nav className="outline-list">
              {toc.map((item) => (
                <button key={item.id} className={`outline-item level-${Math.min(item.level, 4)}`} onClick={() => scrollToHeading(item.id)}>
                  <ChevronRight size={13} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          ) : <p className="outline-empty">{t.outlineEmpty}</p>)}
        </aside>

        <main className="reading-surface">
          <div className="document-meta">
            <div className="document-title">
              <FileText size={15} />
              <span>{fileName ?? t.welcome}</span>
              {filePath && <span className="document-path" title={filePath}>{filePath}</span>}
            </div>
            <span>{wordCount.toLocaleString()} {t.words}</span>
          </div>

          {!content && (
            <div className={`drop-banner ${isDragging ? 'is-dragging' : ''}`} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)}>
              <Upload size={16} />
              <span>{t.dropPrefix} <button onClick={openFile}>{t.browse}</button></span>
            </div>
          )}

          {error && <div className="error-banner" role="alert">{error}</div>}

          <article className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h1: ({ children }) => <h1 id={toc.find((item) => item.label === nodeText(children))?.id}>{children}</h1>,
                h2: ({ children }) => <h2 id={toc.find((item) => item.label === nodeText(children))?.id}>{children}</h2>,
                h3: ({ children }) => <h3 id={toc.find((item) => item.label === nodeText(children))?.id}>{children}</h3>,
                h4: ({ children }) => <h4 id={toc.find((item) => item.label === nodeText(children))?.id}>{children}</h4>,
                a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>,
                img: ({ src, alt, ...props }) => <img src={src && isTauriRuntime() && !/^(https?:|data:|blob:)/.test(src) ? convertFileSrc(src) : src} alt={alt ?? ''} loading="lazy" {...props} />,
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        </main>
      </div>

      <footer className="statusbar">
        <span>{filePath ? t.localFile : t.previewDocument}</span>
        <span>{t.markdownUtf8} · {theme === 'light' ? t.light : t.dark}</span>
      </footer>
      <input ref={inputRef} type="file" accept=".md,.markdown,.mdown,text/markdown" onChange={onInputChange} hidden />
    </div>
  )
}

export default App
