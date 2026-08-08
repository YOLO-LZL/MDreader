import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import {
  Bold,
  BookOpen,
  Brackets,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Image,
  Italic,
  Languages,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  PanelRight,
  Pencil,
  Quote,
  Redo2,
  Save,
  Strikethrough,
  Sun,
  Undo2,
  Upload,
} from 'lucide-react'
import { MarkdownEditor, type EditorCommand, type MarkdownEditorHandle } from './editor/MarkdownEditor'
import {
  countWords,
  errorMessage,
  extractHeadings,
  isDirty as hasUnsavedChanges,
  isMarkdownPath,
  normalizeFilePath,
  type RecentFile,
  type TocItem,
} from './document'
import './App.css'

type Language = 'zh' | 'en'
type Mode = 'read' | 'edit'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
type PendingAction = () => Promise<boolean>

const RECENT_FILES_STORAGE_KEY = 'mdreader-recent-files'
const MAX_RECENT_FILES = 8

const SAMPLE_MARKDOWN_EN = `# Welcome to MDreader

A quiet, local-first Markdown reading space for notes, documentation, and long-form writing.

## Start with a file

Open a **.md** or **.markdown** file from your computer, or drop it anywhere in this window. Your document stays local to this app.

## What is supported

- GitHub Flavored Markdown tables and task lists
- Code blocks with syntax highlighting
- Relative images and links
- A generated outline for quick navigation

> Tip: use the outline on the right to move through a long document.

### A small example

~~~ts
const reading = 'focused'
console.log('Markdown feels ' + reading + ' here.')
~~~

| Feature | Status |
| --- | --- |
| Local files | Ready |
| Themes | Ready |
| Editing | Ready |
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

> 提示：长文档可以使用右侧目录快速浏览章节。

### 一个小例子

~~~ts
const reading = 'focused'
console.log('Markdown feels ' + reading + ' here.')
~~~

| 功能 | 状态 |
| --- | --- |
| 本地文件 | 已支持 |
| 主题切换 | 已支持 |
| 编辑功能 | 已支持 |
`

const COPY = {
  en: {
    brandCaption: 'local Markdown',
    openFile: 'Open file',
    openFileTitle: 'Open Markdown file',
    save: 'Save Markdown file',
    toggleSidebar: 'Toggle sidebar',
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
    recentFiles: 'Recent files',
    recentFilesEmpty: 'No recent files.',
    recentFileUnavailable: 'This recent file is unavailable and was removed.',
    collapseSection: 'Collapse section',
    expandSection: 'Expand section',
    readMode: 'Read',
    editMode: 'Edit',
    modeTitle: 'Document mode',
    editorToolbar: 'Formatting toolbar',
    undo: 'Undo',
    redo: 'Redo',
    heading: 'Heading',
    paragraph: 'Text',
    headingOne: 'Heading 1',
    headingTwo: 'Heading 2',
    headingThree: 'Heading 3',
    headingFour: 'Heading 4',
    headingFive: 'Heading 5',
    headingSix: 'Heading 6',
    bold: 'Bold',
    italic: 'Italic',
    strikethrough: 'Strikethrough',
    inlineCode: 'Inline code',
    blockquote: 'Blockquote',
    bulletList: 'Bullet list',
    orderedList: 'Numbered list',
    taskList: 'Task list',
    codeBlock: 'Code block',
    link: 'Link',
    image: 'Image',
    linkPrompt: 'Link URL',
    imagePrompt: 'Image path or URL',
    imageAltPrompt: 'Image description',
    unsaved: 'Unsaved changes',
    saving: 'Saving',
    saved: 'Saved',
    saveFailed: 'Save failed',
    unsavedTitle: 'Unsaved changes',
    unsavedMessage: 'Save your changes before replacing this document?',
    closeTitle: 'Close MDreader',
    closeMessage: 'Save your changes before closing the window?',
    closeFailed: 'Failed to close the window',
    saveChanges: 'Save',
    discardChanges: 'Discard',
    cancel: 'Cancel',
    browserSave: 'Download a copy',
    openLink: 'Open link',
  },
  zh: {
    brandCaption: '本地 Markdown',
    openFile: '打开文件',
    openFileTitle: '打开 Markdown 文件',
    save: '保存 Markdown 文件',
    toggleSidebar: '切换侧栏',
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
    recentFiles: '最近打开',
    recentFilesEmpty: '暂无最近文件。',
    recentFileUnavailable: '最近文件无法访问，已从列表中移除。',
    collapseSection: '收起区域',
    expandSection: '展开区域',
    readMode: '阅读',
    editMode: '编辑',
    modeTitle: '文档模式',
    editorToolbar: '格式工具栏',
    undo: '撤销',
    redo: '重做',
    heading: '标题',
    paragraph: '正文',
    headingOne: '一级标题',
    headingTwo: '二级标题',
    headingThree: '三级标题',
    headingFour: '四级标题',
    headingFive: '五级标题',
    headingSix: '六级标题',
    bold: '粗体',
    italic: '斜体',
    strikethrough: '删除线',
    inlineCode: '行内代码',
    blockquote: '引用',
    bulletList: '无序列表',
    orderedList: '有序列表',
    taskList: '任务列表',
    codeBlock: '代码块',
    link: '链接',
    image: '图片',
    linkPrompt: '链接地址',
    imagePrompt: '图片路径或 URL',
    imageAltPrompt: '图片说明',
    unsaved: '未保存',
    saving: '保存中',
    saved: '已保存',
    saveFailed: '保存失败',
    unsavedTitle: '有未保存的修改',
    unsavedMessage: '替换当前文档前要保存修改吗？',
    closeTitle: '关闭 MDreader',
    closeMessage: '关闭窗口前要保存修改吗？',
    closeFailed: '关闭窗口失败',
    saveChanges: '保存',
    discardChanges: '放弃修改',
    cancel: '取消',
    browserSave: '下载副本',
    openLink: '打开链接',
  },
} as const

type Copy = (typeof COPY)[Language]

function getInitialLanguage(): Language {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('mdreader-language')
    if (stored === 'zh' || stored === 'en') return stored
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function getSampleMarkdown(language: Language) {
  return language === 'zh' ? SAMPLE_MARKDOWN_ZH : SAMPLE_MARKDOWN_EN
}

function readRecentFiles(): RecentFile[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(RECENT_FILES_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    return parsed.flatMap((value): RecentFile[] => {
      if (!value || typeof value !== 'object') return []
      const candidate = value as { name?: unknown; path?: unknown }
      if (typeof candidate.name !== 'string' || typeof candidate.path !== 'string' || !candidate.name.trim() || !candidate.path.trim()) return []
      const key = normalizeFilePath(candidate.path)
      if (!key || seen.has(key)) return []
      seen.add(key)
      return [{ name: candidate.name, path: candidate.path }]
    }).slice(0, MAX_RECENT_FILES)
  } catch {
    return []
  }
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || 'Untitled.md'
}

function withMarkdownExtension(path: string) {
  return isMarkdownPath(path) ? path : `${path}.md`
}

function saveAsBrowserDownload(content: string, name: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = withMarkdownExtension(name || 'Untitled')
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function EditorToolbar({
  copy,
  editorRef,
  disabled,
}: {
  copy: Copy
  editorRef: RefObject<MarkdownEditorHandle | null>
  disabled: boolean
}) {
  const run = (command: EditorCommand) => editorRef.current?.execute(command)
  const keepSelection = (event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault()

  function promptForLink() {
    const href = window.prompt(copy.linkPrompt, 'https://')
    if (href?.trim()) run({ type: 'link', href: href.trim() })
  }

  function promptForImage() {
    const src = window.prompt(copy.imagePrompt)
    if (!src?.trim()) return
    const alt = window.prompt(copy.imageAltPrompt, '') ?? ''
    run({ type: 'image', src: src.trim(), alt })
  }

  return (
    <div className="editor-toolbar" role="toolbar" aria-label={copy.editorToolbar}>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'undo' })} title={copy.undo} aria-label={copy.undo}>
        <Undo2 size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'redo' })} title={copy.redo} aria-label={copy.redo}>
        <Redo2 size={15} />
      </button>
      <span className="editor-tool-divider" />
      <select className="heading-select" disabled={disabled} defaultValue="" onChange={(event) => {
        const level = Number(event.target.value)
        if (level) run(level === 0 ? { type: 'paragraph' } : { type: 'heading', level })
        event.currentTarget.value = ''
      }} aria-label={copy.heading} title={copy.heading}>
        <option value="" disabled>{copy.heading}</option>
        <option value="0">{copy.paragraph}</option>
        <option value="1">{copy.headingOne}</option>
        <option value="2">{copy.headingTwo}</option>
        <option value="3">{copy.headingThree}</option>
        <option value="4">{copy.headingFour}</option>
        <option value="5">{copy.headingFive}</option>
        <option value="6">{copy.headingSix}</option>
      </select>
      <span className="editor-tool-divider" />
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'strong' })} title={copy.bold} aria-label={copy.bold}>
        <Bold size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'emphasis' })} title={copy.italic} aria-label={copy.italic}>
        <Italic size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'strikethrough' })} title={copy.strikethrough} aria-label={copy.strikethrough}>
        <Strikethrough size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'inlineCode' })} title={copy.inlineCode} aria-label={copy.inlineCode}>
        <Code2 size={15} />
      </button>
      <span className="editor-tool-divider" />
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'bulletList' })} title={copy.bulletList} aria-label={copy.bulletList}>
        <List size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'orderedList' })} title={copy.orderedList} aria-label={copy.orderedList}>
        <ListOrdered size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'taskList' })} title={copy.taskList} aria-label={copy.taskList}>
        <ListChecks size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'blockquote' })} title={copy.blockquote} aria-label={copy.blockquote}>
        <Quote size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={() => run({ type: 'codeBlock' })} title={copy.codeBlock} aria-label={copy.codeBlock}>
        <Brackets size={15} />
      </button>
      <span className="editor-tool-divider" />
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={promptForLink} title={copy.link} aria-label={copy.link}>
        <Link2 size={15} />
      </button>
      <button className="editor-tool-button" disabled={disabled} onMouseDown={keepSelection} onClick={promptForImage} title={copy.image} aria-label={copy.image}>
        <Image size={15} />
      </button>
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const [content, setContent] = useState(() => getSampleMarkdown(language))
  const [persistedContent, setPersistedContent] = useState(() => getSampleMarkdown(language))
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isSample, setIsSample] = useState(true)
  const [mode, setMode] = useState<Mode>('read')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [recentOpen, setRecentOpen] = useState(true)
  const [outlineSectionOpen, setOutlineSectionOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(readRecentFiles)
  const [documentKey, setDocumentKey] = useState(0)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [pendingClose, setPendingClose] = useState(false)
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const readingSurfaceRef = useRef<HTMLElement>(null)
  const savingRef = useRef(false)
  const isDirtyRef = useRef(false)
  const copyRef = useRef<Copy>(COPY[language])

  const copy = COPY[language]
  copyRef.current = copy
  const dirty = hasUnsavedChanges(content, persistedContent)
  isDirtyRef.current = dirty
  const isSaving = saveState === 'saving'
  const toc = useMemo(() => extractHeadings(content), [content])
  const wordCount = useMemo(() => countWords(content), [content])

  useEffect(() => {
    window.localStorage.setItem('mdreader-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(recentFiles))
    } catch {
      // localStorage may be unavailable in a restricted browser context.
    }
  }, [recentFiles])

  const rememberRecentFile = useCallback((path: string, name: string) => {
    const recentFile = { name, path }
    const key = normalizeFilePath(path)
    setRecentFiles((previous) => [
      recentFile,
      ...previous.filter((item) => normalizeFilePath(item.path) !== key),
    ].slice(0, MAX_RECENT_FILES))
  }, [])

  const removeRecentFile = useCallback((path: string) => {
    const key = normalizeFilePath(path)
    setRecentFiles((previous) => previous.filter((item) => normalizeFilePath(item.path) !== key))
  }, [])

  const loadText = useCallback((text: string, name: string | null, path: string | null, sample = false) => {
    setContent(text)
    setPersistedContent(text)
    setFileName(name)
    setFilePath(path)
    setIsSample(sample)
    setMode('read')
    setSaveState('saved')
    setError(null)
    setDocumentKey((value) => value + 1)
  }, [])

  const loadPath = useCallback(async (path: string, options?: { removeOnFailure?: boolean }) => {
    const removeOnFailure = options?.removeOnFailure ?? false
    if (!isMarkdownPath(path)) {
      if (removeOnFailure) removeRecentFile(path)
      setError(copyRef.current.chooseMarkdown)
      return false
    }

    try {
      const text = isTauriRuntime()
        ? await invoke<string>('read_markdown_file', { path })
        : await fetch(path).then((response) => response.text())
      const name = fileNameFromPath(path)
      loadText(text, name, path)
      rememberRecentFile(path, name)
      return true
    } catch (cause) {
      if (removeOnFailure) {
        removeRecentFile(path)
        setError(copyRef.current.recentFileUnavailable)
      } else {
        setError(errorMessage(cause, copyRef.current.unableToOpen))
      }
      return false
    }
  }, [loadText, rememberRecentFile, removeRecentFile])

  const saveDocument = useCallback(async () => {
    if (savingRef.current) return false
    savingRef.current = true
    setSaveState('saving')
    setError(null)

    let targetPath = filePath
    let targetName = fileName ?? 'Untitled.md'
    try {
      if (isTauriRuntime()) {
        if (!targetPath) {
          const selected = await saveDialog({
            defaultPath: withMarkdownExtension(targetName),
            filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
          })
          if (!selected) {
            setSaveState(isDirtyRef.current ? 'dirty' : 'saved')
            return false
          }
          targetPath = withMarkdownExtension(selected)
        }

        targetPath = withMarkdownExtension(targetPath)
        targetName = fileNameFromPath(targetPath)
        await invoke('write_markdown_file', { path: targetPath, content })
      } else {
        targetName = withMarkdownExtension(targetName)
        saveAsBrowserDownload(content, targetName)
      }

      setPersistedContent(content)
      setFilePath(targetPath)
      setFileName(targetName)
      setIsSample(false)
      setSaveState('saved')
      if (targetPath) rememberRecentFile(targetPath, targetName)
      return true
    } catch (cause) {
      setSaveState('error')
      setError(errorMessage(cause, copyRef.current.saveFailed))
      return false
    } finally {
      savingRef.current = false
    }
  }, [content, fileName, filePath, rememberRecentFile])

  const requestAction = useCallback((action: PendingAction) => {
    if (savingRef.current) {
      setError(copyRef.current.saving)
      return
    }
    if (isDirtyRef.current) {
      setPendingAction(() => action)
      setPendingClose(false)
      setUnsavedPromptOpen(true)
      return
    }
    void action()
  }, [])

  const requestOpenPath = useCallback((path: string, options?: { removeOnFailure?: boolean }) => {
    requestAction(() => loadPath(path, options))
  }, [loadPath, requestAction])

  const drainPendingFiles = useCallback(async () => {
    try {
      const pendingPaths = await invoke<string[]>('take_pending_files')
      if (pendingPaths[0]) requestOpenPath(pendingPaths[0])
    } catch (cause) {
      setError(errorMessage(cause, copyRef.current.unableToOpen))
    }
  }, [requestOpenPath])

  const openFile = useCallback(async () => {
    try {
      setError(null)
      if (isTauriRuntime()) {
        const selected = await openDialog({
          multiple: false,
          directory: false,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
        })
        if (!selected || Array.isArray(selected)) return
        requestOpenPath(selected)
        return
      }
      inputRef.current?.click()
    } catch (cause) {
      setError(errorMessage(cause, copyRef.current.unableToOpen))
    }
  }, [requestOpenPath])

  const onInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!isMarkdownPath(file.name)) {
      setError(copyRef.current.chooseMarkdown)
      return
    }
    requestAction(async () => {
      loadText(await file.text(), file.name, null)
      return true
    })
  }, [loadText, requestAction])

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (!isMarkdownPath(file.name)) {
      setError(copyRef.current.chooseMarkdown)
      return
    }
    requestAction(async () => {
      loadText(await file.text(), file.name, null)
      return true
    })
  }, [loadText, requestAction])

  const handleEditorChange = useCallback((nextContent: string) => {
    setContent(nextContent)
    setSaveState(nextContent === persistedContent ? 'saved' : 'dirty')
    setError(null)
  }, [persistedContent])

  const applyHeadingIds = useCallback(() => {
    const container = readingSurfaceRef.current
    if (!container) return
    const headings = container.querySelectorAll<HTMLElement>('.markdown-editor .editor h1, .markdown-editor .editor h2, .markdown-editor .editor h3, .markdown-editor .editor h4, .markdown-editor .editor h5, .markdown-editor .editor h6')
    headings.forEach((heading, index) => {
      const id = toc[index]?.id
      if (id) heading.id = id
      else heading.removeAttribute('id')
    })
  }, [toc])

  useEffect(() => {
    const frame = window.requestAnimationFrame(applyHeadingIds)
    return () => window.cancelAnimationFrame(frame)
  }, [applyHeadingIds])

  const scrollToHeading = useCallback((id: string) => {
    const container = readingSurfaceRef.current
    const heading = document.getElementById(id)
    if (!container || !heading) return

    const top = heading.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 24
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])

  const changeLanguage = useCallback(() => {
    const nextLanguage: Language = language === 'zh' ? 'en' : 'zh'
    const switchSample = async () => {
      setLanguage(nextLanguage)
      if (isSample) loadText(getSampleMarkdown(nextLanguage), null, null, true)
      return true
    }

    if (isSample && isDirtyRef.current) {
      requestAction(switchSample)
      return
    }
    void switchSample()
  }, [isSample, language, loadText, requestAction])

  const resolvePendingAction = useCallback(async (decision: 'save' | 'discard' | 'cancel') => {
    if (decision === 'cancel') {
      setUnsavedPromptOpen(false)
      setPendingAction(null)
      setPendingClose(false)
      return
    }

    const action = pendingAction
    const shouldClose = pendingClose
    if (decision === 'save' && !(await saveDocument())) return
    setUnsavedPromptOpen(false)
    setPendingAction(null)
    setPendingClose(false)

    if (shouldClose && isTauriRuntime()) {
      try {
        await getCurrentWindow().destroy()
      } catch (cause) {
        setError(errorMessage(cause, copyRef.current.closeFailed))
        setPendingClose(true)
        setUnsavedPromptOpen(true)
      }
      return
    }
    if (action) await action()
  }, [pendingAction, pendingClose, saveDocument])

  useEffect(() => {
    if (!isTauriRuntime()) return

    let disposed = false
    let unlistenOpenFiles: (() => void) | undefined
    let unlistenDrop: (() => void) | undefined

    void (async () => {
      const cleanupOpenFiles = await listen('open-files', () => {
        if (!disposed) void drainPendingFiles()
      })
      if (disposed) cleanupOpenFiles()
      else unlistenOpenFiles = cleanupOpenFiles

      const cleanupDrop = await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (disposed || payload.type !== 'drop' || !payload.paths.length) return
        void invoke('enqueue_pending_files', { paths: payload.paths }).catch((cause) => {
          if (!disposed) setError(errorMessage(cause, copyRef.current.unableToOpen))
        })
      })
      if (disposed) cleanupDrop()
      else unlistenDrop = cleanupDrop

      const initialPaths = await invoke<string[]>('take_pending_files')
      if (!disposed && initialPaths[0]) await loadPath(initialPaths[0])
    })().catch((cause) => {
      if (!disposed) setError(errorMessage(cause, copyRef.current.unableToOpen))
    })

    return () => {
      disposed = true
      unlistenOpenFiles?.()
      unlistenDrop?.()
    }
  }, [drainPendingFiles, loadPath])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let disposed = false
    let unlisten: (() => void) | undefined

    void getCurrentWindow().onCloseRequested((event) => {
      if (disposed || (!isDirtyRef.current && !savingRef.current)) return
      event.preventDefault()
      setPendingClose(true)
      setPendingAction(null)
      setUnsavedPromptOpen(true)
    }).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    }).catch((cause) => setError(errorMessage(cause, copyRef.current.unableToOpen)))

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    // Tauri owns the native close prompt through onCloseRequested above.
    // A browser beforeunload handler can otherwise cancel its forced destroy.
    if (isTauriRuntime()) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void saveDocument()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveDocument])

  const statusText = isSaving
    ? copy.saving
    : saveState === 'error'
      ? copy.saveFailed
      : dirty
        ? copy.unsaved
        : isSample
          ? copy.previewDocument
          : copy.saved

  return (
    <div className={`app-shell ${theme}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><BookOpen size={17} strokeWidth={2.2} /></div>
          <span>MDreader</span>
          <span className="brand-caption">{copy.brandCaption}</span>
        </div>
        <div className="topbar-actions">
          <button className="toolbar-button primary" onClick={() => void openFile()} disabled={isSaving} title={copy.openFileTitle}>
            <FolderOpen size={16} />
            <span>{copy.openFile}</span>
          </button>
          <button className="icon-button" onClick={() => void saveDocument()} disabled={isSaving} title={copy.save} aria-label={copy.save}>
            <Save size={17} />
          </button>
          <button className="icon-button" onClick={() => setOutlineOpen((value) => !value)} title={copy.toggleSidebar} aria-label={copy.toggleSidebar}>
            <PanelRight size={18} />
          </button>
          <button className="icon-button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} title={copy.toggleTheme} aria-label={copy.toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="language-toggle" onClick={changeLanguage} title={copy.languageTitle} aria-label={copy.languageTitle}>
            <Languages size={16} />
            <span className={language === 'zh' ? 'active' : ''}>中</span>
            <span className="language-divider">/</span>
            <span className={language === 'en' ? 'active' : ''}>EN</span>
          </button>
          <a className="icon-button" href="https://github.com" target="_blank" rel="noreferrer" title={copy.github} aria-label={copy.github}>
            <GitBranch size={18} />
          </a>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar-panel recent-panel" aria-label={copy.recentFiles}>
          <div className="sidebar-content">
            <section className={`recent-section ${recentOpen ? '' : 'collapsed'}`}>
              <div className="outline-heading">
                <span className="section-heading-main"><History size={15} /><span>{copy.recentFiles}</span></span>
                <button
                  className="section-toggle"
                  onClick={() => setRecentOpen((value) => !value)}
                  title={recentOpen ? copy.collapseSection : copy.expandSection}
                  aria-label={recentOpen ? copy.collapseSection : copy.expandSection}
                  aria-expanded={recentOpen}
                  aria-controls="recent-files-list"
                >
                  {recentOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
              {recentOpen && (recentFiles.length ? (
                <nav id="recent-files-list" className="recent-list" aria-label={copy.recentFiles}>
                  {recentFiles.map((item) => {
                    const isCurrent = Boolean(filePath && normalizeFilePath(filePath) === normalizeFilePath(item.path))
                    return (
                      <button
                        key={normalizeFilePath(item.path)}
                        className={`recent-file-item ${isCurrent ? 'active' : ''}`}
                        onClick={() => requestOpenPath(item.path, { removeOnFailure: true })}
                        title={item.path}
                        aria-current={isCurrent ? 'page' : undefined}
                        disabled={isSaving}
                      >
                        <FileText size={14} />
                        <span>{item.name}</span>
                      </button>
                    )
                  })}
                </nav>
              ) : <p className="outline-empty">{copy.recentFilesEmpty}</p>)}
            </section>
          </div>
        </aside>

        <main ref={readingSurfaceRef} className="reading-surface">
          <div className="document-meta">
            <div className="document-title">
              <FileText size={15} />
              <span>{fileName ?? copy.welcome}</span>
              {dirty && <span className="dirty-dot" title={copy.unsaved} aria-label={copy.unsaved}>●</span>}
              {filePath && <span className="document-path" title={filePath}>{filePath}</span>}
            </div>
            <div className="document-meta-side">
              <span className={`save-state save-state-${saveState}`}>{statusText}</span>
              <span>{wordCount.toLocaleString()} {copy.words}</span>
            </div>
          </div>

          <div className="document-actions">
            <div className="mode-switch" role="tablist" aria-label={copy.modeTitle}>
              <button className={mode === 'read' ? 'active' : ''} onClick={() => setMode('read')} role="tab" aria-selected={mode === 'read'} title={copy.readMode}>
                <Eye size={14} />
                <span>{copy.readMode}</span>
              </button>
              <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')} role="tab" aria-selected={mode === 'edit'} title={copy.editMode} disabled={isSaving}>
                <Pencil size={14} />
                <span>{copy.editMode}</span>
              </button>
            </div>
            {mode === 'edit' && <EditorToolbar copy={copy} editorRef={editorRef} disabled={isSaving} />}
          </div>

          {isSample && mode === 'read' && (
            <div className={`drop-banner ${isDragging ? 'is-dragging' : ''}`} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)}>
              <Upload size={16} />
              <span>{copy.dropPrefix} <button onClick={() => void openFile()}>{copy.browse}</button></span>
            </div>
          )}

          {error && <div className="error-banner" role="alert">{error}</div>}

          <MarkdownEditor
            key={documentKey}
            ref={editorRef}
            markdown={content}
            documentKey={documentKey}
            documentPath={filePath}
            readOnly={mode === 'read' || isSaving}
            onChange={handleEditorChange}
            onUpdate={applyHeadingIds}
            onOpenLink={(href) => window.open(href, '_blank', 'noopener,noreferrer')}
          />
        </main>

        <aside className={`sidebar-panel outline-panel ${outlineOpen ? '' : 'collapsed'}`} aria-label={copy.outline}>
          {outlineOpen && (
            <div className="sidebar-content">
              <section className={`outline-section ${outlineSectionOpen ? '' : 'collapsed'}`}>
                <div className="outline-heading">
                  <span className="section-heading-main"><List size={15} /><span>{copy.outline}</span></span>
                  <button
                    className="section-toggle"
                    onClick={() => setOutlineSectionOpen((value) => !value)}
                    title={outlineSectionOpen ? copy.collapseSection : copy.expandSection}
                    aria-label={outlineSectionOpen ? copy.collapseSection : copy.expandSection}
                    aria-expanded={outlineSectionOpen}
                    aria-controls="outline-list"
                  >
                    {outlineSectionOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                </div>
                {outlineSectionOpen && (toc.length ? (
                  <nav id="outline-list" className="outline-list" aria-label={copy.outline}>
                    {toc.map((item: TocItem) => (
                      <button key={item.id} className={`outline-item level-${Math.min(item.level, 4)}`} onClick={() => scrollToHeading(item.id)}>
                        <ChevronRight size={13} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </nav>
                ) : <p className="outline-empty">{copy.outlineEmpty}</p>)}
              </section>
            </div>
          )}
        </aside>
      </div>

      <footer className="statusbar">
        <span>{statusText} · {filePath ? copy.localFile : isSample ? copy.previewDocument : copy.browserSave}</span>
        <span>{copy.markdownUtf8} · {theme === 'light' ? copy.light : copy.dark}</span>
      </footer>

      <input ref={inputRef} type="file" accept=".md,.markdown,.mdown,text/markdown" onChange={onInputChange} hidden />

      {unsavedPromptOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
            <h2 id="unsaved-dialog-title">{pendingClose ? copy.closeTitle : copy.unsavedTitle}</h2>
            <p>{pendingClose ? copy.closeMessage : copy.unsavedMessage}</p>
            <div className="dialog-actions">
              <button className="dialog-button" onClick={() => void resolvePendingAction('cancel')}>{copy.cancel}</button>
              <button className="dialog-button danger" onClick={() => void resolvePendingAction('discard')}>{copy.discardChanges}</button>
              <button className="dialog-button primary" onClick={() => void resolvePendingAction('save')}>{copy.saveChanges}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
