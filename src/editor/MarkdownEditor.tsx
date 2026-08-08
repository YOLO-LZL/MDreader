import { forwardRef, useEffect, useImperativeHandle, useRef, type ForwardedRef, type MouseEvent } from 'react'
import {
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  Editor,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import {
  createCodeBlockCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'
import { gfm, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { prism } from '@milkdown/plugin-prism'
import { insert } from '@milkdown/kit/utils'
import type { Ctx } from '@milkdown/kit/ctx'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { isAbsoluteFilePath, resolveLocalImagePath } from '../document'
import {
  createMarkdownSyntaxPlugin,
  markdownSyntaxPluginKey,
} from './markdownSyntax'
import './MarkdownEditor.css'

export type EditorCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'heading'; level: number }
  | { type: 'paragraph' }
  | { type: 'strong' }
  | { type: 'emphasis' }
  | { type: 'strikethrough' }
  | { type: 'inlineCode' }
  | { type: 'blockquote' }
  | { type: 'bulletList' }
  | { type: 'orderedList' }
  | { type: 'taskList' }
  | { type: 'codeBlock' }
  | { type: 'link'; href: string }
  | { type: 'image'; src: string; alt: string }

export type MarkdownEditorHandle = {
  execute: (command: EditorCommand) => void
  focus: () => void
}

type MarkdownEditorProps = {
  markdown: string
  documentKey: number
  documentPath: string | null
  readOnly: boolean
  onChange: (markdown: string) => void
  onUpdate: () => void
  onOpenLink?: (href: string) => void
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isExternalImageSource(source: string) {
  return /^(?:https?:|data:|blob:|asset:|file:)/i.test(source)
}

function resolveImageSource(source: string, documentPath: string | null) {
  if (!source || !isTauriRuntime() || isExternalImageSource(source)) return source

  const localPath = resolveLocalImagePath(source, documentPath)
  return isAbsoluteFilePath(localPath) || documentPath
    ? `${convertFileSrc(localPath.replace(/[?#].*$/, ''))}${localPath.match(/[?#].*$/)?.[0] ?? ''}`
    : source
}

function decorateImages(ctx: Ctx, documentPath: string | null) {
  const view = ctx.get(editorViewCtx)
  view.dom.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const currentSource = image.getAttribute('src')
    if (!currentSource) return

    const previousSource = image.dataset.mdSource
    const previousResolved = previousSource ? resolveImageSource(previousSource, documentPath) : null
    const source = previousSource && currentSource === previousResolved ? previousSource : currentSource
    image.dataset.mdSource = source

    const resolvedSource = resolveImageSource(source, documentPath)
    if (resolvedSource && currentSource !== resolvedSource) image.setAttribute('src', resolvedSource)
  })
}

function EditorCanvas({
  markdown,
  documentKey,
  documentPath,
  readOnly,
  onChange,
  onUpdate,
  onOpenLink,
}: MarkdownEditorProps, ref: ForwardedRef<MarkdownEditorHandle>) {
  const readOnlyRef = useRef(readOnly)
  const documentPathRef = useRef(documentPath)
  const onChangeRef = useRef(onChange)
  const onUpdateRef = useRef(onUpdate)
  const onOpenLinkRef = useRef(onOpenLink)
  readOnlyRef.current = readOnly
  documentPathRef.current = documentPath
  onChangeRef.current = onChange
  onUpdateRef.current = onUpdate
  onOpenLinkRef.current = onOpenLink

  const editor = useEditor(
    (root) => Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, markdown)
        ctx.set(editorViewOptionsCtx, { editable: () => !readOnlyRef.current })
        ctx.get(listenerCtx)
          .mounted((context) => {
            decorateImages(context, documentPathRef.current)
            onUpdateRef.current()
          })
          .updated((context) => {
            decorateImages(context, documentPathRef.current)
            onUpdateRef.current()
          })
          .markdownUpdated((_context, nextMarkdown) => {
            onChangeRef.current(nextMarkdown)
          })
      })
      .use(commonmark)
      .use(gfm)
      .use(prism)
      .use(history)
      .use(createMarkdownSyntaxPlugin(() => readOnlyRef.current))
      .use(listener),
    [documentKey],
  )

  useEffect(() => {
    if (editor.loading) return
    const instance = editor.get()
    if (!instance) return

    instance.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.setProps({ editable: () => !readOnlyRef.current })
      view.dispatch(view.state.tr.setMeta(markdownSyntaxPluginKey, { refresh: true }))
    })
  }, [editor, editor.loading, readOnly])

  useImperativeHandle(ref, () => ({
    execute(command) {
      if (readOnlyRef.current) return
      const instance = editor.get()
      if (!instance) return

      instance.action((ctx) => {
        const commands = ctx.get(commandsCtx)
        switch (command.type) {
          case 'undo':
            commands.call(undoCommand.key)
            break
          case 'redo':
            commands.call(redoCommand.key)
            break
          case 'heading':
            commands.call(wrapInHeadingCommand.key, Math.min(6, Math.max(1, command.level)))
            break
          case 'paragraph':
            commands.call(turnIntoTextCommand.key)
            break
          case 'strong':
            commands.call(toggleStrongCommand.key)
            break
          case 'emphasis':
            commands.call(toggleEmphasisCommand.key)
            break
          case 'strikethrough':
            commands.call(toggleStrikethroughCommand.key)
            break
          case 'inlineCode':
            commands.call(toggleInlineCodeCommand.key)
            break
          case 'blockquote':
            commands.call(wrapInBlockquoteCommand.key)
            break
          case 'bulletList':
            commands.call(wrapInBulletListCommand.key)
            break
          case 'orderedList':
            commands.call(wrapInOrderedListCommand.key)
            break
          case 'taskList':
            insert('- [ ] Task item', false)(ctx)
            break
          case 'codeBlock':
            commands.call(createCodeBlockCommand.key)
            break
          case 'link':
            commands.call(toggleLinkCommand.key, { href: command.href })
            break
          case 'image':
            commands.call(insertImageCommand.key, { src: command.src, alt: command.alt })
            break
        }
        ctx.get(editorViewCtx).focus()
      })
    },
    focus() {
      editor.get()?.action((ctx) => ctx.get(editorViewCtx).focus())
    },
  }), [editor])

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    if (!link) return

    if (!readOnlyRef.current) {
      event.preventDefault()
      return
    }

    const href = link.getAttribute('href')
    if (href && onOpenLinkRef.current) {
      event.preventDefault()
      onOpenLinkRef.current(href)
    }
  }

  return (
    <div className={`markdown-editor ${readOnly ? 'is-readonly' : 'is-editing'}`} onClick={handleClick}>
      <Milkdown />
    </div>
  )
}

const EditorCanvasWithRef = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(EditorCanvas)

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => (
  <MilkdownProvider>
    <EditorCanvasWithRef {...props} ref={ref} />
  </MilkdownProvider>
))

MarkdownEditor.displayName = 'MarkdownEditor'
