import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  List,
  Moon,
  PanelLeft,
  Sun,
  Upload,
} from 'lucide-react'
import './App.css'

type TocItem = { id: string; label: string; level: number }

const SAMPLE_MARKDOWN = `# Welcome to MDreader

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

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
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
  const inputRef = useRef<HTMLInputElement>(null)

  const markdown = content || SAMPLE_MARKDOWN
  const toc = useMemo(() => extractHeadings(markdown), [markdown])
  const wordCount = useMemo(() => markdown.trim().split(/\s+/).filter(Boolean).length, [markdown])

  async function loadText(text: string, name: string, path?: string) {
    setContent(text)
    setFileName(name)
    setFilePath(path ?? null)
    setError(null)
  }

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
        const text = await readTextFile(selected)
        const name = selected.split(/[\\/]/).pop() ?? 'Untitled.md'
        await loadText(text, name, selected)
        return
      }
      inputRef.current?.click()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open this file.')
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
    if (!/\.(md|markdown|mdown)$/i.test(file.name)) {
      setError('Please choose a Markdown file.')
      return
    }
    await loadText(await file.text(), file.name)
  }

  function scrollToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`app-shell ${theme}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><BookOpen size={17} strokeWidth={2.2} /></div>
          <span>MDreader</span>
          <span className="brand-caption">local Markdown</span>
        </div>
        <div className="topbar-actions">
          <button className="toolbar-button primary" onClick={openFile} title="Open Markdown file">
            <FolderOpen size={16} />
            <span>Open file</span>
          </button>
          <button className="icon-button" onClick={() => setOutlineOpen((value) => !value)} title="Toggle outline">
            <PanelLeft size={18} />
          </button>
          <button className="icon-button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} title="Toggle theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <a className="icon-button" href="https://github.com" target="_blank" rel="noreferrer" title="Project on GitHub">
            <GitBranch size={18} />
          </a>
        </div>
      </header>

      <div className="workspace">
        <aside className={`outline-panel ${outlineOpen ? '' : 'collapsed'}`} aria-label="Document outline">
          <div className="outline-heading"><List size={15} /><span>Outline</span></div>
          {outlineOpen && (toc.length ? (
            <nav className="outline-list">
              {toc.map((item) => (
                <button key={item.id} className={`outline-item level-${Math.min(item.level, 4)}`} onClick={() => scrollToHeading(item.id)}>
                  <ChevronRight size={13} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          ) : <p className="outline-empty">Open a document to see its sections.</p>)}
        </aside>

        <main className="reading-surface">
          <div className="document-meta">
            <div className="document-title">
              <FileText size={15} />
              <span>{fileName ?? 'Welcome to MDreader'}</span>
              {filePath && <span className="document-path" title={filePath}>{filePath}</span>}
            </div>
            <span>{wordCount.toLocaleString()} words</span>
          </div>

          {!content && (
            <div className={`drop-banner ${isDragging ? 'is-dragging' : ''}`} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)}>
              <Upload size={16} />
              <span>Drop a Markdown file here, or <button onClick={openFile}>browse your files</button></span>
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
        <span>{filePath ? 'Local file' : 'Preview document'}</span>
        <span>Markdown · UTF-8 · {theme === 'light' ? 'Light' : 'Dark'} theme</span>
      </footer>
      <input ref={inputRef} type="file" accept=".md,.markdown,.mdown,text/markdown" onChange={onInputChange} hidden />
    </div>
  )
}

export default App
