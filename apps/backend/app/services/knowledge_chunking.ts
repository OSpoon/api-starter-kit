import env from '#start/env'

const DEFAULT_CHUNK_LENGTH = 1800
const DEFAULT_CHUNK_OVERLAP = 200
const DEFAULT_SEMANTIC_BREAKPOINT_PERCENTILE = 90

export function extractKnowledgeSearchTerms(query: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  return [
    ...new Set(
      [...segmenter.segment(query.toLowerCase())]
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment.trim())
        .filter((term) => term.length >= 2)
    ),
  ].slice(0, 8)
}

export function splitKnowledgeContent(
  content: string,
  maxLength = DEFAULT_CHUNK_LENGTH,
  overlap = DEFAULT_CHUNK_OVERLAP
) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (maxLength < 100 || overlap < 0 || overlap >= maxLength) {
    throw new Error('知识库分块参数无效')
  }

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxLength, normalized.length)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end)
      if (boundary > start + Math.floor(maxLength / 2)) end = boundary
    }
    chunks.push(normalized.slice(start, end).trim())
    if (end === normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

type SemanticUnit = {
  content: string
  forceBoundaryBefore: boolean
}

export function semanticChunkingOptions() {
  const maxLength = env.get('KNOWLEDGE_CHUNK_MAX_CHARACTERS') ?? DEFAULT_CHUNK_LENGTH
  const overlap = env.get('KNOWLEDGE_CHUNK_OVERLAP_CHARACTERS') ?? DEFAULT_CHUNK_OVERLAP
  const breakpointPercentile =
    env.get('KNOWLEDGE_SEMANTIC_BREAKPOINT_PERCENTILE') ?? DEFAULT_SEMANTIC_BREAKPOINT_PERCENTILE
  if (
    maxLength < 100 ||
    overlap < 0 ||
    overlap >= maxLength ||
    breakpointPercentile < 50 ||
    breakpointPercentile > 100
  ) {
    throw new Error('知识库语义分块参数无效')
  }
  return { maxLength, overlap, breakpointPercentile }
}

export function splitSemanticUnits(content: string): SemanticUnit[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const units: SemanticUnit[] = []
  let startsParagraph = true

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      startsParagraph = true
      continue
    }

    const isHeading = /^(#{1,6}\s+|[-*+]\s+)/.test(line)
    const sentences = line.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [line]
    for (const [index, sentence] of sentences.entries()) {
      const normalized = sentence.trim()
      if (!normalized) continue
      units.push({
        content: normalized,
        forceBoundaryBefore: startsParagraph || (isHeading && index === 0),
      })
      startsParagraph = false
    }
  }
  return units
}

function percentile(values: number[], value: number) {
  if (!values.length) return Number.POSITIVE_INFINITY
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((value / 100) * sorted.length))]
}

function overlapUnits(units: string[], overlap: number) {
  const trailing: string[] = []
  let length = 0
  for (const unit of [...units].reverse()) {
    trailing.unshift(unit)
    length += unit.length + (trailing.length > 1 ? 1 : 0)
    if (length >= overlap) break
  }
  return trailing
}

export function buildSemanticKnowledgeChunks(input: {
  units: SemanticUnit[]
  distances: number[]
  maxLength: number
  overlap: number
  breakpointPercentile: number
}) {
  const { units, distances, maxLength, overlap, breakpointPercentile } = input
  if (!units.length) return []
  const threshold = percentile(distances, breakpointPercentile)
  const minLengthBeforeSemanticBreak = Math.floor(maxLength / 3)
  const chunks: string[] = []
  let current: string[] = []
  let currentLength = 0

  const flush = () => {
    const chunk = current.join(' ').trim()
    if (chunk) chunks.push(chunk)
    current = overlapUnits(current, overlap)
    currentLength = current.join(' ').length
  }

  for (const [index, unit] of units.entries()) {
    if (unit.content.length > maxLength) {
      if (current.length) flush()
      chunks.push(...splitKnowledgeContent(unit.content, maxLength, overlap))
      current = []
      currentLength = 0
      continue
    }

    const nextLength = currentLength + (current.length ? 1 : 0) + unit.content.length
    const semanticBoundary =
      index > 0 &&
      (unit.forceBoundaryBefore || distances[index - 1] >= threshold) &&
      currentLength >= minLengthBeforeSemanticBreak
    if (current.length && (nextLength > maxLength || semanticBoundary)) flush()
    current.push(unit.content)
    currentLength += (current.length > 1 ? 1 : 0) + unit.content.length
  }
  if (current.length) chunks.push(current.join(' ').trim())
  return chunks
}

export type { SemanticUnit }
