export type TocItem = { id: string; label: string; level: number }
export type RecentFile = { name: string; path: string }

export type FilePathStyle = 'windows' | 'posix'

function inferFilePathStyle(path: string): FilePathStyle {
  if (/^[A-Za-z]:[\\/]/.test(path) || /^\\\\/.test(path)) return 'windows'
  return !path.startsWith('/') && path.includes('\\') ? 'windows' : 'posix'
}

function normalizeWindowsLocalFilePath(path: string) {
  const normalized = path.replace(/\//g, '\\')
  const drive = /^[A-Za-z]:/.exec(normalized)?.[0] ?? ''
  const driveAbsolute = Boolean(drive && normalized[2] === '\\')
  const isUnc = normalized.startsWith('\\\\')
  const isRootRelative = !drive && !isUnc && normalized.startsWith('\\')
  const prefix = drive
    ? `${drive}${driveAbsolute ? '\\' : ''}`
    : isUnc
      ? '\\\\'
      : isRootRelative
      ? '\\'
      : ''
  const body = normalized.slice(prefix.length)
  const segments: string[] = []
  const protectedSegments = isUnc ? 2 : 0

  for (const segment of body.split('\\')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length > protectedSegments && segments[segments.length - 1] !== '..') {
        segments.pop()
      } else if (!prefix) {
        segments.push(segment)
      }
      continue
    }
    segments.push(segment)
  }

  return `${prefix}${segments.join('\\')}` || (prefix || '.')
}

function normalizePosixLocalFilePath(path: string) {
  const absolute = path.startsWith('/')
  const segments: string[] = []

  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length && segments[segments.length - 1] !== '..') segments.pop()
      else if (!absolute) segments.push(segment)
      continue
    }
    segments.push(segment)
  }

  const body = segments.join('/')
  if (absolute) return body ? `/${body}` : '/'
  return body || (path ? '.' : '')
}

export function normalizeLocalFilePath(path: string, style: FilePathStyle = inferFilePathStyle(path)) {
  return style === 'windows' ? normalizeWindowsLocalFilePath(path) : normalizePosixLocalFilePath(path)
}

export function normalizeFilePath(path: string) {
  const style = inferFilePathStyle(path.trim())
  const normalized = normalizeLocalFilePath(path.trim(), style)
  return style === 'windows' ? normalized.toLowerCase() : normalized
}

export function isMarkdownPath(path: string) {
  return /\.(md|markdown|mdown)$/i.test(path)
}

export function isAbsoluteFilePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\/.test(path) || path.startsWith('/')
}

export function decodeFilePath(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function resolveLocalImagePath(source: string, documentPath: string | null) {
  const separatorIndex = source.search(/[?#]/)
  const pathPart = separatorIndex >= 0 ? source.slice(0, separatorIndex) : source
  const suffix = separatorIndex >= 0 ? source.slice(separatorIndex) : ''
  const decodedPath = decodeFilePath(pathPart)
  const style = documentPath ? inferFilePathStyle(documentPath) : inferFilePathStyle(decodedPath)
  const lastSeparator = documentPath
    ? Math.max(documentPath.lastIndexOf('/'), documentPath.lastIndexOf('\\'))
    : -1
  const documentDirectory = documentPath && lastSeparator >= 0 ? documentPath.slice(0, lastSeparator) : ''
  const separator = style === 'windows' ? '\\' : '/'
  const resolvedPath = isAbsoluteFilePath(decodedPath)
    ? normalizeLocalFilePath(decodedPath, inferFilePathStyle(decodedPath))
    : !documentPath
      ? decodedPath
      : normalizeLocalFilePath(`${documentDirectory}${separator}${decodedPath}`, style)

  return `${resolvedPath}${suffix}`
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function cleanHeadingLabel(value: string) {
  return value
    .replace(/[ \t]+#+[ \t]*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]/g, '')
    .trim()
}

export function extractHeadings(markdown: string): TocItem[] {
  const used = new Map<string, number>()
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
  const headings: TocItem[] = []
  let fence: { character: string; length: number } | null = null

  const addHeading = (rawLabel: string, level: number) => {
    const label = cleanHeadingLabel(rawLabel)
    if (!label) return
    const base = slugify(label) || 'section'
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    headings.push({ id: count ? `${base}-${count}` : base, label, level })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) {
        fence = { character: marker[0], length: marker.length }
      } else if (fence.character === marker[0] && marker.length >= fence.length) {
        fence = null
      }
      continue
    }
    if (fence) continue

    const atxMatch = /^ {0,3}(#{1,6})(?:[ \t]+(.+?)\s*|)$/.exec(line)
    if (atxMatch?.[2]) {
      addHeading(atxMatch[2], atxMatch[1].length)
      continue
    }

    const setextMatch = index + 1 < lines.length ? /^ {0,3}(=+|-+)\s*$/.exec(lines[index + 1]) : null
    if (line.trim() && setextMatch) {
      addHeading(line, setextMatch[1][0] === '=' ? 1 : 2)
      index += 1
    }
  }

  return headings
}

export function countWords(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length
}

export function isDirty(content: string, persistedContent: string) {
  return content !== persistedContent
}

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}
