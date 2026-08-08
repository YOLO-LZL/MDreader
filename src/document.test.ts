import { describe, expect, it } from 'vitest'
import {
  countWords,
  errorMessage,
  extractHeadings,
  isDirty,
  isMarkdownPath,
  normalizeFilePath,
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

  it('keeps Windows path keys case-insensitive while preserving POSIX case and roots', () => {
    expect(normalizeFilePath('C:/Notes/Docs/../Readme.md')).toBe('c:\\notes\\readme.md')
    expect(normalizeFilePath('C:\\NOTES\\README.MD')).toBe('c:\\notes\\readme.md')
    expect(normalizeFilePath('\\\\Server\\Share\\Folder\\..\\Readme.md')).toBe('\\\\server\\share\\readme.md')
    expect(normalizeFilePath('/Users/Alice/Docs/../Readme.md')).toBe('/Users/Alice/Readme.md')
    expect(normalizeLocalFilePath('/../')).toBe('/')
  })

  it('resolves POSIX relative images, encoded names, and URL suffixes', () => {
    expect(resolveLocalImagePath('../assets/pic%20one.png?raw=1#preview', '/Users/Alice/docs/readme.md'))
      .toBe('/Users/Alice/assets/pic one.png?raw=1#preview')
    expect(resolveLocalImagePath('./images/../pic%20two.png', '/Users/Alice/readme.md'))
      .toBe('/Users/Alice/pic two.png')
    expect(resolveLocalImagePath('/Users/Alice/docs/../pic%20three.png', '/Users/Alice/readme.md'))
      .toBe('/Users/Alice/pic three.png')
  })

  it('validates supported Markdown extensions and save errors', () => {
    expect(isMarkdownPath('README.MD')).toBe(true)
    expect(isMarkdownPath('notes.txt')).toBe(false)
    expect(errorMessage(new Error('permission denied'), 'fallback')).toBe('permission denied')
    expect(errorMessage('unknown', 'fallback')).toBe('fallback')
  })
})
