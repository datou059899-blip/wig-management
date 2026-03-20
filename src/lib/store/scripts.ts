import { createPersistedStore, useStore } from './createStore'
import type { ScriptItem } from './types'

export type ScriptsState = {
  scripts: ScriptItem[]
  selectedId: string | null
}

function nowIso() {
  return new Date().toISOString()
}

function seedScripts(): ScriptsState {
  const now = nowIso()
  const scripts: ScriptItem[] = [
    {
      id: `seed_${Date.now()}_1`,
      title: '爆款开头：结果先给 + 反差对比',
      platform: 'TikTok',
      sku: 'SKU-001',
      sourceUrl: '',
      status: 'draft',
      updatedAt: now,
      tags: ['前3秒', '节奏', '字幕'],
      isLearned: false,
      isPracticing: false,
      positionAnalysis: '目标：拉新转化。人群：想快速变美的用户。',
      hookAnalysis: '开头 1 句强结果 + 2 秒对比画面。',
      rhythmAnalysis: '1-2 秒一转场，信息密度高。',
      shotAnalysis: '特写→对比→上头效果→产品细节。',
      subtitleAnalysis: '关键句更短更硬，关键词更靠前。',
      whyItWorked: '结果先给降低理解成本，反差强化记忆点。',
      whatToWatch: '不要拖沓，开头 3 秒必须有强钩子。',
      commonMistakes: '开头没结果\n镜头拖沓\n字幕太长',
      todayExecution: '做 2 个开头版本对比，产出 1 条 15–25s 练习成片。',
    },
    {
      id: `seed_${Date.now()}_2`,
      title: '卖点拆解：3 段式表达（痛点→方案→证据）',
      platform: 'TikTok',
      sku: 'SKU-002',
      sourceUrl: '',
      status: 'draft',
      updatedAt: now,
      tags: ['卖点', '字幕'],
      isLearned: false,
      isPracticing: false,
      positionAnalysis: '',
      hookAnalysis: '',
      rhythmAnalysis: '',
      shotAnalysis: '',
      subtitleAnalysis: '',
      whyItWorked: '',
      whatToWatch: '',
      commonMistakes: '',
      todayExecution: '',
    },
  ]
  return { scripts, selectedId: scripts[0]?.id || null }
}

function isScriptsState(x: unknown): x is ScriptsState {
  if (!x || typeof x !== 'object') return false
  const any = x as any
  if (!Array.isArray(any.scripts)) return false
  return true
}

export const scriptsStore = createPersistedStore<ScriptsState>({
  storageKey: 'core_scripts_v1',
  getInitialState: seedScripts,
  validate: isScriptsState,
})

export const useScriptsStore = <S,>(selector: (s: ScriptsState) => S) => useStore(scriptsStore, selector)

export function hydrateScripts() {
  scriptsStore.hydrate()
}

export function selectScript(id: string | null) {
  scriptsStore.setState((prev) => ({ ...prev, selectedId: id }))
}

export function upsertScript(patch: Partial<ScriptItem> & { id: string }) {
  scriptsStore.setState((prev) => {
    const now = nowIso()
    const idx = prev.scripts.findIndex((s) => s.id === patch.id)
    if (idx === -1) {
      const item: ScriptItem = {
        id: patch.id,
        title: patch.title || '未命名脚本',
        platform: patch.platform || 'TikTok',
        sku: patch.sku || '',
        sourceUrl: patch.sourceUrl || '',
        status: patch.status || 'draft',
        updatedAt: patch.updatedAt || now,
        tags: patch.tags || [],
        isLearned: Boolean(patch.isLearned),
        isPracticing: Boolean(patch.isPracticing),
        positionAnalysis: patch.positionAnalysis || '',
        hookAnalysis: patch.hookAnalysis || '',
        rhythmAnalysis: patch.rhythmAnalysis || '',
        shotAnalysis: patch.shotAnalysis || '',
        subtitleAnalysis: patch.subtitleAnalysis || '',
        whyItWorked: patch.whyItWorked || '',
        whatToWatch: patch.whatToWatch || '',
        commonMistakes: patch.commonMistakes || '',
        todayExecution: patch.todayExecution || '',
      }
      return { ...prev, scripts: [item, ...prev.scripts], selectedId: item.id }
    }
    const next = prev.scripts.slice()
    next[idx] = { ...next[idx], ...patch, updatedAt: patch.updatedAt || now } as ScriptItem
    return { ...prev, scripts: next }
  })
}

export function deleteScript(id: string) {
  scriptsStore.setState((prev) => {
    const idx = prev.scripts.findIndex((s) => s.id === id)
    const next = prev.scripts.filter((s) => s.id !== id)
    let selectedId = prev.selectedId
    if (prev.selectedId === id) {
      selectedId = next[Math.min(idx, next.length - 1)]?.id || null
    }
    return { ...prev, scripts: next, selectedId }
  })
}

