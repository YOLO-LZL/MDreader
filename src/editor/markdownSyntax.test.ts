import { describe, expect, it } from 'vitest'
import { Schema, type Mark, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import { getMarkdownSyntaxRanges, type MarkdownSyntaxRange } from './markdownSyntax'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
    },
    blockquote: { content: 'block+', group: 'block' },
    bullet_list: {
      attrs: { spread: { default: false } },
      content: 'list_item+',
      group: 'block',
    },
    ordered_list: {
      attrs: { order: { default: 1 }, spread: { default: false } },
      content: 'list_item+',
      group: 'block',
    },
    list_item: {
      attrs: {
        checked: { default: null },
        label: { default: '•' },
        listType: { default: 'bullet' },
      },
      content: 'paragraph block*',
      group: 'block',
    },
    code_block: {
      attrs: { language: { default: '' } },
      content: 'text*',
      group: 'block',
    },
    hr: { group: 'block' },
    image: {
      atom: true,
      attrs: { alt: { default: '' }, src: { default: '' } },
      inline: true,
      group: 'inline',
    },
    text: { group: 'inline' },
  },
  marks: {
    strong: { attrs: { marker: { default: '*' } } },
    emphasis: { attrs: { marker: { default: '*' } } },
    strike_through: {},
    inlineCode: {},
    link: { attrs: { href: {}, title: { default: null } } },
  },
})

function text(value: string, marks: readonly Mark[] = []) {
  return schema.text(value, marks)
}

function node(
  type: string,
  attrs: Record<string, unknown> | null,
  content: readonly ProseMirrorNode[] = []
) {
  return schema.node(type, attrs, content)
}

function cursorAt(doc: Parameters<typeof getMarkdownSyntaxRanges>[0], value: string) {
  let position = -1
  doc.descendants((current, pos) => {
    if (position < 0 && current.isText && current.text === value) position = pos + 1
  })
  if (position < 0) throw new Error(`Text node not found: ${value}`)
  return TextSelection.create(doc, position)
}

function selectionAcross(doc: Parameters<typeof getMarkdownSyntaxRanges>[0]) {
  return TextSelection.create(doc, 1, doc.content.size - 1)
}

function matching(ranges: MarkdownSyntaxRange[], kind: MarkdownSyntaxRange['kind']) {
  return ranges.filter((range) => range.kind === kind)
}

describe('markdown syntax ranges', () => {
  it('shows the correct number of heading markers at the cursor', () => {
    for (let level = 1; level <= 6; level += 1) {
      const doc = node('doc', null, [node('heading', { level }, [text('Heading')])])
      const ranges = getMarkdownSyntaxRanges(doc, cursorAt(doc, 'Heading'))

      expect(matching(ranges, 'heading').map((range) => range.before)).toEqual([
        `${'#'.repeat(level)} `,
      ])
    }
  })

  it('shows one pair for each active inline mark', () => {
    const strong = schema.marks.strong.create({ marker: '*' })
    const emphasis = schema.marks.emphasis.create({ marker: '*' })
    const strike = schema.marks.strike_through.create()
    const inlineCode = schema.marks.inlineCode.create()
    const link = schema.marks.link.create({ href: 'https://example.com', title: null })
    const doc = node('doc', null, [
      node('paragraph', null, [
        text('bold', [strong]),
        text('italic', [emphasis]),
        text('strike', [strike]),
        text('code', [inlineCode]),
        text('link', [link]),
      ]),
    ])

    const ranges = getMarkdownSyntaxRanges(doc, selectionAcross(doc))

    expect(matching(ranges, 'strong').map(({ before, after }) => [before, after])).toEqual([['**', '**']])
    expect(matching(ranges, 'emphasis').map(({ before, after }) => [before, after])).toEqual([['*', '*']])
    expect(matching(ranges, 'strikethrough').map(({ before, after }) => [before, after])).toEqual([['~~', '~~']])
    expect(matching(ranges, 'inline-code').map(({ before, after }) => [before, after])).toEqual([['`', '`']])
    expect(matching(ranges, 'link').map(({ before, after }) => [before, after])).toEqual([
      ['[', '](https://example.com)'],
    ])
  })

  it('shows nested list prefixes and task list state', () => {
    const nestedList = node('bullet_list', null, [
      node('list_item', { checked: null, label: '•', listType: 'bullet' }, [
        node('paragraph', null, [text('nested')]),
      ]),
    ])
    const orderedList = node('ordered_list', { order: 4 }, [
      node('list_item', { checked: null, label: '4.', listType: 'ordered' }, [
        node('paragraph', null, [text('outer')]),
        nestedList,
      ]),
    ])
    const taskList = node('bullet_list', null, [
      node('list_item', { checked: true, label: '•', listType: 'bullet' }, [
        node('paragraph', null, [text('done')]),
      ]),
    ])
    const doc = node('doc', null, [orderedList, taskList])

    const nestedRanges = getMarkdownSyntaxRanges(doc, cursorAt(doc, 'nested'))
    expect(matching(nestedRanges, 'list').map((range) => range.before)).toEqual(['4. ', '- '])

    const taskRanges = getMarkdownSyntaxRanges(doc, cursorAt(doc, 'done'))
    expect(matching(taskRanges, 'task-list').map((range) => range.before)).toEqual(['- [x] '])
  })

  it('keeps code language, ordered starts, and task checkbox syntax', () => {
    const code = node('code_block', { language: 'ts' }, [text('const value = 1')])
    const orderedList = node('ordered_list', { order: 7 }, [
      node('list_item', { checked: null, label: '7.', listType: 'ordered' }, [
        node('paragraph', null, [text('first')]),
      ]),
    ])
    const uncheckedTask = node('bullet_list', null, [
      node('list_item', { checked: false, label: '•', listType: 'bullet' }, [
        node('paragraph', null, [text('todo')]),
      ]),
    ])
    const doc = node('doc', null, [code, orderedList, uncheckedTask])

    const codeRanges = getMarkdownSyntaxRanges(doc, cursorAt(doc, 'const value = 1'))
    expect(matching(codeRanges, 'code-block').map(({ before, after }) => [before, after])).toEqual([
      ['```ts', '```'],
    ])

    expect(matching(getMarkdownSyntaxRanges(doc, cursorAt(doc, 'first')), 'list').map((range) => range.before))
      .toEqual(['7. '])
    expect(matching(getMarkdownSyntaxRanges(doc, cursorAt(doc, 'todo')), 'task-list').map((range) => range.before))
      .toEqual(['- [ ] '])
  })

  it('merges adjacent fragments and emits each involved structure once', () => {
    const strong = schema.marks.strong.create({ marker: '*' })
    const emphasis = schema.marks.emphasis.create({ marker: '*' })
    const doc = node('doc', null, [
      node('paragraph', null, [text('one', [strong, emphasis]), text('two', [strong, emphasis])]),
    ])

    const ranges = getMarkdownSyntaxRanges(doc, selectionAcross(doc))

    expect(matching(ranges, 'strong')).toHaveLength(1)
    expect(matching(ranges, 'emphasis')).toHaveLength(1)
  })

  it('supports blockquote, horizontal rule, and image node decorations', () => {
    const image = node('image', { alt: 'diagram', src: 'diagram.png' })
    const doc = node('doc', null, [
      node('blockquote', null, [node('paragraph', null, [text('quoted')])]),
      node('paragraph', null, [image]),
      node('hr', null),
    ])

    expect(matching(getMarkdownSyntaxRanges(doc, cursorAt(doc, 'quoted')), 'blockquote').map((range) => range.before))
      .toEqual(['> '])

    const imageRanges = getMarkdownSyntaxRanges(doc, NodeSelection.create(doc, 11))
    expect(matching(imageRanges, 'image').map(({ before, after }) => [before, after])).toEqual([
      ['![diagram](diagram.png)', ''],
    ])

    const hrPosition = doc.child(0).nodeSize + doc.child(1).nodeSize
    const hrRanges = getMarkdownSyntaxRanges(doc, NodeSelection.create(doc, hrPosition))
    expect(matching(hrRanges, 'horizontal-rule').map((range) => range.before)).toEqual(['---'])
  })

  it('does not expose markers for plain, blurred, or read-only content', () => {
    const doc = node('doc', null, [node('paragraph', null, [text('plain')])])
    const selection = cursorAt(doc, 'plain')

    expect(getMarkdownSyntaxRanges(doc, selection)).toEqual([])
    expect(getMarkdownSyntaxRanges(doc, selection, { focused: false })).toEqual([])
    expect(getMarkdownSyntaxRanges(doc, selection, { readOnly: true })).toEqual([])
  })
})
