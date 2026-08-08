import type { Mark, Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type Selection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

export type MarkdownSyntaxKind =
  | 'blockquote'
  | 'code-block'
  | 'emphasis'
  | 'heading'
  | 'horizontal-rule'
  | 'image'
  | 'inline-code'
  | 'link'
  | 'list'
  | 'strikethrough'
  | 'strong'
  | 'task-list'

export type MarkdownSyntaxRange = {
  kind: MarkdownSyntaxKind
  from: number
  to: number
  before: string
  after: string
  key: string
}

type SyntaxCandidate = MarkdownSyntaxRange & {
  category: 'mark' | 'node'
  scopeFrom: number
  scopeTo: number
  signature?: string
  order: number
}

type Ancestor = {
  node: ProseMirrorNode
  pos: number
}

type MarkdownSyntaxPluginState = {
  decorations: DecorationSet
  focused: boolean
}

type MarkdownSyntaxMeta = {
  focused?: boolean
  refresh?: boolean
}

const markdownSyntaxPluginKey = new PluginKey<MarkdownSyntaxPluginState>(
  'MDREADER_MARKDOWN_SYNTAX'
)

const KIND_ORDER: Record<MarkdownSyntaxKind, number> = {
  blockquote: 10,
  heading: 20,
  list: 30,
  'task-list': 30,
  'code-block': 40,
  'horizontal-rule': 40,
  image: 40,
  strong: 50,
  emphasis: 51,
  strikethrough: 52,
  'inline-code': 53,
  link: 54,
}

export type MarkdownSyntaxPlugin = ReturnType<typeof createMarkdownSyntaxPlugin>

export const createMarkdownSyntaxPlugin = (isReadOnly: () => boolean) =>
  $prose(() => {
    return new Plugin<MarkdownSyntaxPluginState>({
      key: markdownSyntaxPluginKey,
      state: {
        init: () => ({
          decorations: DecorationSet.empty,
          focused: false,
        }),
        apply: (tr, previous, oldState, newState) => {
          const meta = tr.getMeta(markdownSyntaxPluginKey) as MarkdownSyntaxMeta | undefined
          const focused = meta?.focused ?? previous.focused

          if (isReadOnly() || !focused) {
            return { decorations: DecorationSet.empty, focused }
          }

          if (
            meta?.refresh ||
            tr.docChanged ||
            !tr.selection.eq(oldState.selection)
          ) {
            return {
              decorations: createDecorationSet(newState.doc, newState.selection),
              focused,
            }
          }

          return {
            decorations: previous.decorations.map(tr.mapping, newState.doc),
            focused,
          }
        },
      },
      props: {
        decorations: (state) => {
          if (isReadOnly()) return DecorationSet.empty
          return markdownSyntaxPluginKey.getState(state)?.decorations ?? DecorationSet.empty
        },
        handleDOMEvents: {
          focus: (view) => {
            view.dispatch(view.state.tr.setMeta(markdownSyntaxPluginKey, { focused: true }))
            return false
          },
          blur: (view) => {
            view.dispatch(view.state.tr.setMeta(markdownSyntaxPluginKey, { focused: false }))
            return false
          },
        },
      },
    })
  })

export { markdownSyntaxPluginKey }

export function getMarkdownSyntaxRanges(
  doc: ProseMirrorNode,
  selection: Selection,
  options: { focused?: boolean; readOnly?: boolean } = {}
): MarkdownSyntaxRange[] {
  if (options.focused === false || options.readOnly) return []

  const candidates: SyntaxCandidate[] = []
  const markSegments = new Map<string, MarkSegment[]>()
  let order = 0

  const addCandidate = (
    candidate: Omit<SyntaxCandidate, 'order'>
  ) => {
    candidates.push({ ...candidate, order })
    order += 1
  }

  const walk = (
    node: ProseMirrorNode,
    pos: number,
    ancestors: readonly Ancestor[],
    index: number
  ) => {
    const type = node.type.name
    const scopeFrom = pos
    const scopeTo = pos + node.nodeSize

    if (node.isText) {
      collectMarkSegments(node, pos, markSegments)
      return
    }

    if (type === 'heading') {
      const level = Math.max(1, Math.min(6, Number(node.attrs.level) || 1))
      const contentStart = pos + 1
      addCandidate({
        after: '',
        before: `${'#'.repeat(level)} `,
        category: 'node',
        from: contentStart,
        key: `heading:${pos}:${level}`,
        kind: 'heading',
        scopeFrom,
        scopeTo,
        to: contentStart,
      })
    }

    if (type === 'code_block') {
      const contentStart = pos + 1
      const contentEnd = pos + node.nodeSize - 1
      const language = typeof node.attrs.language === 'string' ? node.attrs.language : ''
      addCandidate({
        after: '```',
        before: `\`\`\`${language}`,
        category: 'node',
        from: contentStart,
        key: `code-block:${pos}:${language}`,
        kind: 'code-block',
        scopeFrom,
        scopeTo,
        to: contentEnd,
      })
    }

    if (type === 'hr') {
      addCandidate({
        after: '',
        before: '---',
        category: 'node',
        from: pos,
        key: `horizontal-rule:${pos}`,
        kind: 'horizontal-rule',
        scopeFrom,
        scopeTo,
        to: pos,
      })
    }

    if (type === 'image') {
      const alt = String(node.attrs.alt ?? '')
      const src = String(node.attrs.src ?? '')
      addCandidate({
        after: '',
        before: `![${alt}](${src})`,
        category: 'node',
        from: pos,
        key: `image:${pos}:${alt}:${src}`,
        kind: 'image',
        scopeFrom,
        scopeTo,
        to: pos + node.nodeSize,
      })
    }

    const parentList = ancestors.at(-1)
    if (type === 'list_item' && parentList) {
      const firstChild = node.firstChild
      const firstChildPos = pos + 1
      const markerPos = firstChild
        ? firstChild.isLeaf
          ? firstChildPos
          : firstChildPos + 1
        : firstChildPos
      const isOrdered = parentList.node.type.name === 'ordered_list'
      const itemIndex = index
      const orderStart = Number(parentList.node.attrs.order) || 1
      const itemLabel = String(node.attrs.label ?? '')
      const listMarker = isOrdered
        ? itemLabel.endsWith('.')
          ? itemLabel
          : `${orderStart + itemIndex}.`
        : '-'
      const checked = node.attrs.checked
      const taskMarker = checked == null ? '' : checked ? '[x] ' : '[ ] '
      const kind = taskMarker ? 'task-list' : 'list'

      addCandidate({
        after: '',
        before: `${listMarker} ${taskMarker}`,
        category: 'node',
        from: markerPos,
        key: `list-item:${pos}:${listMarker}:${taskMarker}`,
        kind,
        scopeFrom,
        scopeTo,
        to: markerPos,
      })
    }

    if (isLineBlock(type)) {
      const markerPos = node.isLeaf ? pos : pos + 1
      const blockquotes = ancestors.filter(({ node: ancestor }) => ancestor.type.name === 'blockquote')
      blockquotes.forEach((blockquote, blockquoteIndex) => {
        addCandidate({
          after: '',
          before: '> ',
          category: 'node',
          from: markerPos,
          key: `blockquote:${blockquote.pos}:${pos}:${blockquoteIndex}`,
          kind: 'blockquote',
          scopeFrom,
          scopeTo,
          to: markerPos,
        })
      })
    }

    const childAncestors = [...ancestors, { node, pos }]
    let childPos = type === 'doc' ? pos : pos + 1
    node.forEach((child, offset, childIndex) => {
      walk(child, childPos + offset, childAncestors, childIndex)
    })
  }

  walk(doc, 0, [], 0)

  markSegments.forEach((segments) => {
    segments.forEach((segment) => {
      addCandidate({
        after: segment.after,
        before: segment.before,
        category: 'mark',
        from: segment.from,
        key: `mark:${segment.kind}:${segment.from}:${segment.to}:${segment.signature}`,
        kind: segment.kind,
        scopeFrom: segment.from,
        scopeTo: segment.to,
        signature: segment.signature,
        to: segment.to,
      })
    })
  })

  return candidates
    .filter((candidate) => isCandidateVisible(candidate, selection))
    .sort(compareCandidates)
    .map(({ category: _category, order: _order, scopeFrom: _scopeFrom, scopeTo: _scopeTo, signature: _signature, ...range }) => range)
}

type MarkSegment = {
  after: string
  before: string
  from: number
  kind: Extract<MarkdownSyntaxKind, 'emphasis' | 'inline-code' | 'link' | 'strikethrough' | 'strong'>
  signature: string
  to: number
}

function collectMarkSegments(
  node: ProseMirrorNode,
  pos: number,
  segmentsBySignature: Map<string, MarkSegment[]>
) {
  node.marks.forEach((mark) => {
    const syntax = getMarkSyntax(mark)
    if (!syntax) return

    const from = pos
    const to = pos + node.nodeSize
    const segments = segmentsBySignature.get(syntax.signature) ?? []
    const previous = segments.at(-1)

    if (previous?.to === from) {
      previous.to = to
    } else {
      segments.push({ ...syntax, from, to })
    }

    segmentsBySignature.set(syntax.signature, segments)
  })
}

function getMarkSyntax(mark: Mark): Omit<MarkSegment, 'from' | 'to'> | null {
  const signature = `${mark.type.name}:${JSON.stringify(mark.attrs)}`

  switch (mark.type.name) {
    case 'strong': {
      const marker = mark.attrs.marker === '_' ? '__' : '**'
      return {
        after: marker,
        before: marker,
        kind: 'strong',
        signature,
      }
    }
    case 'emphasis': {
      const marker = mark.attrs.marker === '_' ? '_' : '*'
      return {
        after: marker,
        before: marker,
        kind: 'emphasis',
        signature,
      }
    }
    case 'strike_through':
      return {
        after: '~~',
        before: '~~',
        kind: 'strikethrough',
        signature,
      }
    case 'inlineCode':
      return {
        after: '`',
        before: '`',
        kind: 'inline-code',
        signature,
      }
    case 'link': {
      const href = String(mark.attrs.href ?? '')
      const title = mark.attrs.title ? ` "${String(mark.attrs.title)}"` : ''
      return {
        after: `](${href}${title})`,
        before: '[',
        kind: 'link',
        signature,
      }
    }
    default:
      return null
  }
}

function isLineBlock(type: string) {
  return type === 'paragraph' || type === 'heading' || type === 'code_block' || type === 'hr'
}

function isCandidateVisible(candidate: SyntaxCandidate, selection: Selection) {
  const from = Math.min(selection.from, selection.to)
  const to = Math.max(selection.from, selection.to)

  if (!selection.empty) {
    return candidate.scopeFrom < to && candidate.scopeTo > from
  }

  if (candidate.category === 'mark') {
    const position = selection.from
    if (position < candidate.scopeFrom || position > candidate.scopeTo) return false
    return selection.$from.marks().some((mark) => getMarkSignature(mark) === candidate.signature)
  }

  return candidate.scopeFrom < selection.from && selection.from < candidate.scopeTo
}

function getMarkSignature(mark: Mark) {
  return `${mark.type.name}:${JSON.stringify(mark.attrs)}`
}

function compareCandidates(left: SyntaxCandidate, right: SyntaxCandidate) {
  if (left.from !== right.from) return left.from - right.from
  const kindOrder = KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
  if (kindOrder !== 0) return kindOrder
  return left.order - right.order
}

function createDecorationSet(doc: ProseMirrorNode, selection: Selection) {
  const ranges = getMarkdownSyntaxRanges(doc, selection)
  const groups = new Map<string, { after: boolean; key: string; position: number; text: string }>()

  ranges.forEach((range) => {
    if (range.before) addWidgetGroup(groups, range.from, -1, range.before, range.key)
    if (range.after) addWidgetGroup(groups, range.to, 1, range.after, range.key)
  })

  const decorations = [...groups.values()].map((group) =>
    Decoration.widget(
      group.position,
      () => createMarkerElement(group.text, group.after ? 'after' : 'before'),
      {
        ignoreSelection: true,
        key: `${group.after ? 'after' : 'before'}:${group.position}:${group.key}:${group.text}`,
        marks: [],
        side: group.after ? 1 : -1,
      }
    )
  )

  return DecorationSet.create(doc, decorations)
}

function addWidgetGroup(
  groups: Map<string, { after: boolean; key: string; position: number; text: string }>,
  position: number,
  side: -1 | 1,
  text: string,
  rangeKey: string
) {
  const after = side > 0
  const groupKey = `${position}:${after ? 'after' : 'before'}`
  const previous = groups.get(groupKey)
  if (previous) {
    previous.text += text
    previous.key += `|${rangeKey}`
    return
  }

  groups.set(groupKey, { after, key: rangeKey, position, text })
}

function createMarkerElement(text: string, side: 'before' | 'after') {
  const marker = document.createElement('span')
  marker.className = 'markdown-syntax-marker'
  marker.setAttribute('aria-hidden', 'true')
  marker.setAttribute('contenteditable', 'false')
  marker.dataset.markerSide = side

  const content = document.createElement('span')
  content.className = 'markdown-syntax-marker-content'
  content.setAttribute('aria-hidden', 'true')
  content.setAttribute('contenteditable', 'false')
  content.textContent = text
  marker.appendChild(content)

  return marker
}
