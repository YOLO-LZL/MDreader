import { describe, expect, it } from 'vitest'
import {
  countWords,
  errorMessage,
  extractHeadings,
  isDirty,
  isMarkdownPath,
  normalizeLocalFilePath,
  resolveLocalImagePath,
} from './document'

describe('document helpers', () => {
  it('tracks dirty state from the current and persisted Markdown', () => {
    expect(isDirty('# Draft', '# Draft')).toBe(false)
    expect(isDirty('# Draft\n', '# Draft')).toBe(true)
  })

  it('counts words and ignores surrounding whitespace', () => {
    expect(countWords('  one two\nthree  ')).toBe(3)
    expect(countWords(' \n ')).toBe(0)
  })

  it('extracts unique headings outside fenced code blocks', () => {
    const headings = extractHeadings('# Intro\n\n## Intro\n\n```md\n# Hidden\n```\n\nTitle\n---')
    expect(headings).toEqual([
      { id: 'intro', label: 'Intro', level: 1 },
      { id: 'intro-1', label: 'Intro', level: 2 },
      { id: 'title', label: 'Title', level: 2 },
    ])
  })

  it('normalizes relative image paths next to the Markdown file', () => {
    expect(normalizeLocalFilePath('C:/notes/docs/../images/pic.png')).toBe('C:\\notes\\images\\pic.png')
    expect(resolveLocalImagePath('assets/pic%20one.png?raw=1', 'C:\\notes\\readme.md')).toBe('C:\\notes\\assets\\pic one.png?raw=1')
  })

  it('validates supported Markdown extensions and save errors', () => {
    expect(isMarkdownPath('README.MD')).toBe(true)
    expect(isMarkdownPath('notes.txt')).toBe(false)
    expect(errorMessage(new Error('permission denied'), 'fallback')).toBe('permission denied')
    expect(errorMessage('unknown', 'fallback')).toBe('fallback')
  })
})
