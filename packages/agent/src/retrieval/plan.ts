import { z } from 'zod'

export const researchPlanSchema = z.object({
  intent: z.enum(['conversation', 'known_passage', 'named_work', 'theme', 'comparison', 'external', 'documentation']),
  question: z.string().min(1).max(1500).describe('Self-contained inquiry, resolving references in follow-ups without adding assumptions'),
  subquestions: z.array(z.string().min(1).max(500)).min(1).max(3),
  traditions: z.array(z.string().min(1).max(100)).max(6).describe('Only traditions explicitly requested or clearly implied; do not invent comparison partners'),
  works: z.array(z.string().min(1).max(150)).max(4),
  edition: z.string().max(200).describe('Explicit edition/translator constraint, or empty string'),
  phrase: z.string().max(300).describe('Verbatim quotation/term when requested; otherwise empty'),
})
export type ResearchPlan = z.infer<typeof researchPlanSchema>

export function fallbackPlan(question: string): ResearchPlan {
  const text = question.trim().slice(0, 1500) || 'Investigate the available sacred texts'
  const conversation = /^(hi|hello|hey|thanks|thank you|got it|ok|okay)[!.\s]*$/i.test(text)
  return { intent: conversation ? 'conversation' : 'theme', question: text, subquestions: [text], traditions: [], works: [], edition: '', phrase: /[“"]([^”"]{3,300})[”"]/.exec(text)?.[1] ?? '' }
}

export function isLibraryPlan(plan: ResearchPlan): boolean {
  return !['conversation', 'external', 'documentation'].includes(plan.intent)
}

const GROUPS: Record<string, string[]> = {
  hinduism: ['hindu', 'hinduism', 'vedic', 'vedanta', 'upanishads', 'yoga', 'hin'],
  buddhism: ['buddhist', 'buddhism', 'theravada', 'mahayana', 'zen', 'bud'],
  christianity: ['christian', 'christianity', 'christian mysticism', 'bible', 'biblical', 'chr', 'bib'],
  islam: ['islam', 'islamic', 'sufi', 'sufism', 'isl'],
  judaism: ['jewish', 'judaism', 'kabbalah', 'kab', 'jud'],
  gnosticism: ['gnostic', 'gnosticism', 'hermeticism', 'hermetic', 'gno'],
  taoism: ['taoist', 'taoism', 'daoist', 'daoism', 'tao'],
}
export function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
export function traditionMatches(actual: string, requested: string): boolean {
  const a = normalize(actual)
  const b = normalize(requested)
  if (a === b) return true
  const aliases = Object.values(GROUPS).find(group => group.includes(b))
  return Boolean(aliases?.some(alias => a === alias || a.split(' ').includes(alias)))
}

export function remoteTraditions(requested: string, available: string[]): string[] {
  const topic = normalize(requested)
  const expanded = topic === 'sufism' || topic === 'sufi' ? ['Islam', 'Mysticism']
    : topic === 'kabbalah' ? ['Judaism', 'Esoteric']
    : topic === 'hermeticism' || topic === 'hermetic' ? ['Gnosticism', 'Esoteric'] : [requested]
  return available.filter(actual => expanded.some(want => traditionMatches(actual, want)))
}

export const STOP_WORDS = new Set('a an the and or of in to for is are was were with from at by as it its this that what how do does did say says about me we you they their on into than then through can could would should between compare explain texts text book sacred available according understand understanding meaning concept describe mentioned give tell please find where'.split(' '))
export function terms(text: string): string[] {
  return normalize(text).split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word))
}
