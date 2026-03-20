 'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { canEditScripts, isEditorOnly, isScriptsReadOnly } from '@/lib/permissions'

type ScriptListItem = {
  id: string
  title: string
  platform?: string | null
  productSku?: string | null
  sourceUrl?: string | null
  status: string
  updatedAt: string
  breakdowns?: {
    id: string
    version: number
    updatedAt: string
    editedBy?: { id: string; email: string; name?: string | null; role?: string } | null
  }[]
}

type ScriptDetail = Omit<ScriptListItem, 'breakdowns'> & {
  breakdowns: {
    id: string
    version: number
    content: string
    updatedAt: string
    editedBy?: { id: string; email: string; name?: string | null; role?: string } | null
  }[]
  updateLogs?: {
    id: string
    createdAt: string
    summary: string
    impactScope?: string | null
    impactArea?: string | null
    createdByNameSnapshot?: string | null
    createdByRoleSnapshot?: string | null
    breakdownVersion?: number | null
  }[]
}

type ScriptUpdateLog = {
  id: string
  createdAt: string
  summary: string
  impactScope?: string | null
  impactArea?: string | null
  createdByNameSnapshot?: string | null
  createdByRoleSnapshot?: string | null
  script: { id: string; title: string; platform?: string | null; productSku?: string | null }
}

type TrainingTask = {
  id: string
  title: string
  focus?: string | null
  requirement?: string | null
  dueAt?: string | null
  status: string
  script?: { id: string; title: string; platform?: string | null; productSku?: string | null } | null
  owner?: { id: string; email: string; name?: string | null; role?: string } | null
}

type EditorScriptItem = {
  id: string
  title: string
  platform: string
  sku: string
  sourceUrl: string
  status: string
  updatedAt: string
  tags: string[]
  isLearned: boolean
  isPracticing: boolean
  positionAnalysis: string
  hookAnalysis: string
  rhythmAnalysis: string
  shotAnalysis: string
  subtitleAnalysis: string
  whyItWorked: string
  whatToWatch: string
  commonMistakes: string
  todayExecution: string
}

type StoryboardItem = {
  id: string
  order: number
  shotNo: string
  frameImage: string
  shotType: string
  durationSec: number
  content: string
  note: string
}

type InspirationType = '开头' | '转场' | '镜头' | '字幕文案' | '卖点表达'
type InspirationItem = {
  id: string
  title: string
  type: InspirationType
  description: string
  sourceUrl?: string
  referenceImage?: string
  tags: string[]
  createdAt: string
  linkedScriptId?: string
}

type BreakdownSections = {
  positioning: string
  hook3s: string
  rhythm: string
  shots: string
  subtitles: string
  audio: string
  learnings: string
  todayExecution: string
  pitfalls: string
  todayFocus: string
  leadComment: string
  frequentMistakes: string
  goodPatterns: string
  learningStatus: string
  practiceUrl: string
  reviewNotes: string
  storyboard: string // JSON.stringify(StoryboardItem[])
}

type EditorTabKey = 'breakdowns' | 'tasks' | 'reviews' | 'inspirations'

type AnalysisView = 'standard' | 'mine' | 'team'

type StandardAnalysis = {
  id: string
  scriptId: string
  positionAnalysis: string
  hookAnalysis: string
  rhythmAnalysis: string
  shotAnalysis: string
  subtitleAnalysis: string
  whyItWorked: string
  whatToWatch: string
  commonMistakes: string
  todayExecution: string
  updatedAt: string
}

type UserAnalysis = {
  id: string
  scriptId: string
  userId: string
  userName: string
  positionAnalysis: string
  hookAnalysis: string
  rhythmAnalysis: string
  shotAnalysis: string
  subtitleAnalysis: string
  whyItWorked: string
  whatToWatch: string
  commonMistakes: string
  todayExecution: string
  isLearned: boolean
  isPracticing: boolean
  submitStatus: string
  storyboard: any
  updatedAt: string
}

type SubmissionRecord = {
  id: string
  scriptId: string
  scriptTitle: string
  practiceUrl: string
  submittedAt: string
}

const emptySections: BreakdownSections = {
  positioning: '',
  hook3s: '',
  rhythm: '',
  shots: '',
  subtitles: '',
  audio: '',
  learnings: '',
  todayExecution: '',
  pitfalls: '',
  todayFocus: '',
  leadComment: '',
  frequentMistakes: '',
  goodPatterns: '',
  learningStatus: '',
  practiceUrl: '',
  reviewNotes: '',
  storyboard: '',
}

const sectionOrder: { key: keyof BreakdownSections; title: string }[] = [
  { key: 'positioning', title: '视频定位' },
  { key: 'hook3s', title: '前3秒拆解' },
  { key: 'rhythm', title: '节奏拆解' },
  { key: 'shots', title: '镜头拆解' },
  { key: 'subtitles', title: '字幕/文案拆解' },
  { key: 'audio', title: '音效 / BGM / 转场建议' },
  { key: 'learnings', title: '核心学习点' },
  { key: 'todayExecution', title: '今日执行要求' },
  { key: 'pitfalls', title: '常见错误提醒' },
  { key: 'todayFocus', title: '今日新增要求' },
  { key: 'leadComment', title: '负责人点评' },
  { key: 'frequentMistakes', title: '最近高频错误' },
  { key: 'goodPatterns', title: '最近表现好的方法' },
  { key: 'learningStatus', title: '学习状态' },
  { key: 'practiceUrl', title: '练习成片链接' },
  { key: 'reviewNotes', title: '复盘记录' },
  { key: 'storyboard', title: '分镜执行表' },
]

function parseContentToSections(content: string): BreakdownSections {
  if (!content.trim()) return { ...emptySections }

  const sections: BreakdownSections = { ...emptySections }
  const regex = /^##\s+(.+?)\s*$/gm
  const indices: { title: string; index: number }[] = []

  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    indices.push({ title: match[1].trim(), index: match.index })
  }

  if (indices.length === 0) {
    sections.rhythm = content.trim()
    return sections
  }

  indices.forEach((item, idx) => {
    const start = content.indexOf('\n', item.index)
    const end = idx + 1 < indices.length ? indices[idx + 1].index : content.length
    const body = content.slice(start + 1, end).trim()

    const target = sectionOrder.find((s) => item.title.startsWith(s.title))
    if (target) {
      ;(sections as any)[target.key] = body
    }
  })

  return sections
}

function buildContentFromSections(sections: BreakdownSections): string {
  const blocks: string[] = []

  sectionOrder.forEach(({ key, title }) => {
    const value = (sections as any)[key] as string
    if (!value && key !== 'learningStatus' && key !== 'practiceUrl' && key !== 'reviewNotes') {
      return
    }

    if (key === 'learningStatus') {
      blocks.push(`## 学习状态\n${value || ''}`.trim())
    } else if (key === 'practiceUrl') {
      if (value.trim()) {
        blocks.push(`## 练习成片链接\n${value.trim()}`)
      }
    } else if (key === 'reviewNotes') {
      if (value.trim()) {
        blocks.push(`## 复盘记录\n${value.trim()}`)
      }
    } else {
      blocks.push(`## ${title}\n${value || ''}`.trim())
    }
  })

  return blocks.join('\n\n')
}

function inferLearningStatus(sections: BreakdownSections): string {
  const s = sections.learningStatus || ''
  if (s.includes('已掌握')) return '已掌握'
  if (s.includes('学习中')) return '学习中'
  if (s.includes('需复盘')) return '需复盘'
  return '待学习'
}

function roleLabel(role?: string) {
  if (!role) return '-'
  if (role === 'operator') return '运营'
  if (role === 'editor') return '剪辑主管'
  if (role === 'admin') return '老板'
  if (role === 'advertiser') return '投手'
  return role
}

function learningStatusLabel(s: string) {
  if (s === '待学习') return '未查看'
  if (s === '已掌握') return '已完成'
  return s
}

export default function ScriptsPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = canEditScripts(role)
  // 仅影响剪辑视图分支：兼容历史/异常 role 字符串，避免剪辑误落入管理端 UI
  const roleRaw = String(role || '').trim()
  const isEditor = isEditorOnly(role) || roleRaw === '剪辑' || roleRaw === '剪辑主管'
  const scriptsReadOnly = isScriptsReadOnly(role)
  const userId = (session?.user as any)?.id as string | undefined

  const [search, setSearch] = useState('')
  // 管理端/运营端：走后端数据
  const [scripts, setScripts] = useState<ScriptListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<ScriptDetail | null>(null)
  const [sections, setSections] = useState<BreakdownSections>(emptySections)
  const [storyboard, setStoryboard] = useState<StoryboardItem[]>([])
  const [draggingStoryboardId, setDraggingStoryboardId] = useState('')
  const [activeStoryboardId, setActiveStoryboardId] = useState('')
  const [quickStoryboardOpen, setQuickStoryboardOpen] = useState(false)
  const [quickDraftRows, setQuickDraftRows] = useState<
    { id: string; shotNo: string; content: string; shotType: string; durationSec: string; note: string }[]
  >([])

  const inspirationsStorageKey = useMemo(() => {
    if (!userId) return ''
    return `editor_inspirations_v1:${userId}`
  }, [userId])
  const [inspirations, setInspirations] = useState<InspirationItem[]>([])
  const [inspCreateOpen, setInspCreateOpen] = useState(false)
  const [inspTitle, setInspTitle] = useState('')
  const [inspType, setInspType] = useState<InspirationType>('镜头')
  const [inspDesc, setInspDesc] = useState('')
  const [inspSourceUrl, setInspSourceUrl] = useState('')
  const [inspRefImage, setInspRefImage] = useState('')
  const [inspTags, setInspTags] = useState('')
  const [inspQuery, setInspQuery] = useState('')

  const [editorTab, setEditorTab] = useState<EditorTabKey>('breakdowns')
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'list' | 'detail'>('list')
  const [analysisView, setAnalysisView] = useState('mine' as AnalysisView)
  const [standardAnalysis, setStandardAnalysis] = useState(null as StandardAnalysis | null)
  const [myAnalysis, setMyAnalysis] = useState(null as UserAnalysis | null)
  const [teamAnalyses, setTeamAnalyses] = useState([] as UserAnalysis[])
  const [teamSelectedUserId, setTeamSelectedUserId] = useState<string>('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [learningById, setLearningById] = useState<Record<string, string>>({})
  const [tagsById, setTagsById] = useState<Record<string, string[]>>({})
  const [pitfallsById, setPitfallsById] = useState<Record<string, string>>({})
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([])
  const [loadingList, setLoadingList] = useState(true)
  // 仅用于“首次初始化”左侧列表 loading，避免后续轮询/保存/输入导致整列反复进入 loading
  const [isInitializingScripts, setIsInitializingScripts] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  })
  const [leadCommentOpen, setLeadCommentOpen] = useState(false)
  const [editorMoreOpen, setEditorMoreOpen] = useState(false)

  const leadCommentItems = useMemo(
    () => [
      '开头钩子可以再更“结果先给”一点',
      '第 6 秒开始节奏拖了，建议删掉 1 个过渡镜头',
      '字幕卖点句建议更短更硬（关键词更靠前）',
    ],
    [],
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createPlatform, setCreatePlatform] = useState('TikTok')
  const [createSku, setCreateSku] = useState('')
  const [createSourceUrl, setCreateSourceUrl] = useState('')

  const [content, setContent] = useState('')
  const lastSavedRef = useRef<string>('')
  const hasLocalChange = content !== lastSavedRef.current

  const [todayLogs, setTodayLogs] = useState<ScriptUpdateLog[]>([])
  const [todayTasks, setTodayTasks] = useState<TrainingTask[]>([])
  const [allTasks, setAllTasks] = useState<TrainingTask[]>([])
  const [loadingAllTasks, setLoadingAllTasks] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const anyOpen = Boolean(quickStoryboardOpen || inspCreateOpen || createOpen)
    if (!anyOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [quickStoryboardOpen, inspCreateOpen, createOpen])

  const pollMs = 4000
  const hasLoadedDetailOnceRef = useRef(false)
  const hasLoadedListOnceRef = useRef(false)
  const scriptsRef = useRef<ScriptListItem[]>([])
  useEffect(() => {
    scriptsRef.current = scripts
  }, [scripts])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsMobile(!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  const submissionsStorageKey = useMemo(() => {
    if (!userId) return ''
    return `editor_script_submissions_v1:${userId}`
  }, [userId])

  const mapAnalysisToSections = (a: UserAnalysis | null) => {
    if (!a) {
      setSections((prev) => ({
        ...prev,
        positioning: '',
        hook3s: '',
        rhythm: '',
        shots: '',
        subtitles: '',
        learnings: '',
        todayFocus: '',
        pitfalls: '',
        todayExecution: '',
        learningStatus: '',
        storyboard: '',
      }))
      return
    }
    setSections((prev) => ({
      ...prev,
      positioning: a.positionAnalysis || '',
      hook3s: a.hookAnalysis || '',
      rhythm: a.rhythmAnalysis || '',
      shots: a.shotAnalysis || '',
      subtitles: a.subtitleAnalysis || '',
      learnings: a.whyItWorked || '',
      todayFocus: a.whatToWatch || '',
      pitfalls: a.commonMistakes || '',
      todayExecution: a.todayExecution || '',
      learningStatus: a.isLearned ? '已掌握' : prev.learningStatus || '',
      storyboard: a.storyboard ? JSON.stringify(a.storyboard) : prev.storyboard || '',
    }))
  }

  const fetchAnalyses = async (scriptId: string, silent = false) => {
    if (!scriptId) return
    if (!silent) setAnalysisLoading(true)
    try {
      const res = await fetch(`/api/scripts/${scriptId}/analyses`)
      const data = await res.json()
      if (!res.ok) return
      setStandardAnalysis((data.standard || null) as StandardAnalysis | null)
      setMyAnalysis((data.mine || null) as UserAnalysis | null)
      setTeamAnalyses(((data.team || []) as UserAnalysis[]) || [])
      setTeamSelectedUserId('')
      setAnalysisView('mine')
      mapAnalysisToSections((data.mine || null) as UserAnalysis | null)
    } catch {
      // ignore
    } finally {
      if (!silent) setAnalysisLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedId) return
    // 切换脚本时加载协同拆解数据（不与输入/保存强绑定）
    void fetchAnalyses(selectedId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const startMyAnalysis = async (scriptId: string) => {
    if (!scriptId) return
    setAnalysisLoading(true)
    try {
      const res = await fetch(`/api/scripts/${scriptId}/analyses`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '创建失败')
      const mine = (data.mine || null) as UserAnalysis | null
      setMyAnalysis(mine)
      setAnalysisView('mine')
      mapAnalysisToSections(mine)
      setMessage({ type: 'success', text: '已开始我的拆解' })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || '创建失败' })
    } finally {
      setAnalysisLoading(false)
    }
  }

  // 分镜表：从 sections.storyboard(JSON) 派生，只在脚本/拆解变更时同步一次
  useEffect(() => {
    try {
      if (!sections.storyboard?.trim()) {
        setStoryboard([])
        return
      }
      const parsed = JSON.parse(sections.storyboard)
      if (Array.isArray(parsed)) {
        const items = parsed
          .map((it: any, idx: number) => ({
            id: String(it.id || `sb_${idx}_${Math.random().toString(16).slice(2)}`),
            order: Number(it.order ?? idx + 1) || idx + 1,
            shotNo: String(it.shotNo ?? idx + 1),
            frameImage: String(it.frameImage ?? ''),
            shotType: String(it.shotType ?? ''),
            durationSec: Number(it.durationSec ?? 0) || 0,
            content: String(it.content ?? ''),
            note: String(it.note ?? ''),
          }))
          .sort((a, b) => a.order - b.order)
        setStoryboard(items)
      } else {
        setStoryboard([])
      }
    } catch {
      setStoryboard([])
    }
  }, [sections.storyboard])

  const persistStoryboard = (updater: (prev: StoryboardItem[]) => StoryboardItem[]) => {
    setStoryboard((prev) => {
      const next = updater(prev)
      setSections((prevSections) => ({
        ...prevSections,
        storyboard: next.length ? JSON.stringify(next) : '',
      }))
      return next
    })
  }

  const normalizeStoryboard = (rows: StoryboardItem[]) => {
    const sorted = rows
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .map((r, idx) => {
        const order = idx + 1
        return { ...r, order, shotNo: String(order) }
      })
    return sorted
  }

  const resetQuickStoryboardForm = () => {
    const base = Array.from({ length: 5 }).map((_, idx) => ({
      id: `qd_${Date.now().toString(16)}_${idx}_${Math.random().toString(16).slice(2)}`,
      shotNo: String(idx + 1),
      content: '',
      shotType: '',
      durationSec: '',
      note: '',
    }))
    setQuickDraftRows(base)
  }

  useEffect(() => {
    if (!isEditor) return
    if (!submissionsStorageKey) return
    try {
      const raw = window.localStorage.getItem(submissionsStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setSubmissions(
          parsed
            .filter(Boolean)
            .map((r: any) => ({
              id: String(r.id || ''),
              scriptId: String(r.scriptId || ''),
              scriptTitle: String(r.scriptTitle || ''),
              practiceUrl: String(r.practiceUrl || ''),
              submittedAt: String(r.submittedAt || ''),
            }))
            .filter((r) => r.id && r.scriptId && r.practiceUrl),
        )
      }
    } catch {
      // ignore
    }
  }, [isEditor, submissionsStorageKey])

  useEffect(() => {
    if (!isEditor) return
    if (!inspirationsStorageKey) return
    try {
      const raw = window.localStorage.getItem(inspirationsStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setInspirations(
          parsed
            .filter(Boolean)
            .map((x: any) => ({
              id: String(x.id || ''),
              title: String(x.title || ''),
              type: (String(x.type || '镜头') as InspirationType) || '镜头',
              description: String(x.description || ''),
              sourceUrl: x.sourceUrl ? String(x.sourceUrl) : '',
              referenceImage: x.referenceImage ? String(x.referenceImage) : '',
              tags: Array.isArray(x.tags) ? x.tags.map((t: any) => String(t)).filter(Boolean) : [],
              createdAt: String(x.createdAt || new Date().toISOString()),
              linkedScriptId: x.linkedScriptId ? String(x.linkedScriptId) : '',
            }))
            .filter((x: InspirationItem) => x.id && x.title),
        )
      }
    } catch {
      // ignore
    }
  }, [isEditor, inspirationsStorageKey])

  const persistInspirations = (next: InspirationItem[]) => {
    setInspirations(next)
    if (!inspirationsStorageKey) return
    try {
      window.localStorage.setItem(inspirationsStorageKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const persistSubmissions = (next: SubmissionRecord[]) => {
    if (!submissionsStorageKey) return
    try {
      window.localStorage.setItem(submissionsStorageKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const appendSubmission = (scriptId: string, scriptTitle: string, practiceUrl: string) => {
    const url = practiceUrl.trim()
    if (!url) return
    const rec: SubmissionRecord = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      scriptId,
      scriptTitle,
      practiceUrl: url,
      submittedAt: new Date().toISOString(),
    }
    setSubmissions((prev) => {
      const next = [rec, ...prev].slice(0, 200)
      persistSubmissions(next)
      return next
    })
  }

  const fetchTodayLogs = async () => {
    try {
      const res = await fetch('/api/script-updates?date=today&take=50')
      const data = await res.json()
      if (res.ok) setTodayLogs((data.logs || []) as ScriptUpdateLog[])
    } catch {
      // ignore
    }
  }

  const fetchTodayTasks = async () => {
    try {
      const res = await fetch('/api/training-tasks?mine=1&date=today')
      const data = await res.json()
      if (res.ok) setTodayTasks((data.tasks || []) as TrainingTask[])
    } catch {
      // ignore
    }
  }

  const fetchAllMyTasks = async () => {
    setLoadingAllTasks(true)
    try {
      const res = await fetch('/api/training-tasks?mine=1&date=all')
      const data = await res.json()
      if (res.ok) setAllTasks((data.tasks || []) as TrainingTask[])
    } catch {
      // ignore
    } finally {
      setLoadingAllTasks(false)
    }
  }

  useEffect(() => {
    if (!session) return
    fetchTodayLogs()
    fetchTodayTasks()
    fetchAllMyTasks()
    const t = setInterval(() => {
      fetchTodayLogs()
      fetchTodayTasks()
      fetchAllMyTasks()
    }, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user])

  const ensureTasksFromTopScripts = async () => {
    if (!userId) return
    const due = new Date()
    due.setHours(18, 0, 0, 0)
    const picks = scripts.slice(0, 3)
    for (const s of picks) {
      await fetch('/api/training-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigneeId: userId,
          ownerId: userId,
          scriptId: s.id,
          title: `学习《${s.title}》并完成练习`,
          focus: '先对齐“前3秒开头 + 节奏”，做 2 个开头版本对比',
          requirement: '产出 1 条 15–25s 练习成片并提交链接',
          dueAt: due.toISOString(),
          status: 'todo',
        }),
      })
    }
    await fetchTodayTasks()
  }

  const updateTask = async (id: string, patch: any) => {
    try {
      const res = await fetch('/api/training-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const data = await res.json()
      if (res.ok) {
        // 简单起见：重新拉一次
        await fetchTodayTasks()
      } else {
        setMessage({ type: 'error', text: data.error || '任务更新失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '任务更新失败' })
    }
  }

  const createTaskForScript = async (scriptId: string, scriptTitle: string, sku?: string | null) => {
    if (!userId) return
    const due = new Date()
    due.setHours(18, 0, 0, 0)
    try {
      const res = await fetch('/api/training-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigneeId: userId,
          ownerId: userId,
          scriptId,
          title: `学习《${scriptTitle}》并完成练习`,
          focus: '先对齐“前3秒开头 + 节奏”，做 2 个开头版本对比',
          requirement: sku ? `围绕 SKU ${sku} 输出 1 条 15–25s 练习成片并提交链接` : '产出 1 条 15–25s 练习成片并提交链接',
          dueAt: due.toISOString(),
          status: 'todo',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchTodayTasks()
      } else {
        setMessage({ type: 'error', text: data.error || '创建任务失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '创建任务失败' })
    }
  }

  const listQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    params.set('status', 'active')
    return params.toString()
  }, [search])

  const fetchList = async (_silent = false) => {
    // 左侧列表 loading 只允许“首次初始化”出现一次
    if (!hasLoadedListOnceRef.current) {
      setLoadingList(true)
      setIsInitializingScripts(true)
    }
    try {
      const res = await fetch(`/api/scripts?${listQuery}`)
      const data = await res.json()
      if (res.ok) {
        const next = (data.scripts || []).map((s: any) => ({
          ...s,
          updatedAt: String(s.updatedAt),
        }))
        setScripts(next)
      }
    } finally {
      if (!hasLoadedListOnceRef.current) {
        hasLoadedListOnceRef.current = true
        setLoadingList(false)
        setIsInitializingScripts(false)
      }
    }
  }

  // 默认选中逻辑：只在首次加载且当前没有选中时触发
  const didAutoSelectRef = useRef(false)
  useEffect(() => {
    if (didAutoSelectRef.current) return
    if (selectedId) {
      didAutoSelectRef.current = true
      return
    }
    if (scripts.length === 0) return
    setSelectedId(scripts[0].id)
    didAutoSelectRef.current = true
  }, [scripts, selectedId])

  // 兜底：只有当“当前选中脚本不在列表里”（通常是被删除）才切换到第一条
  useEffect(() => {
    if (!selectedId) return
    if (scripts.length === 0) return
    const exists = scripts.some((s) => s.id === selectedId)
    if (!exists) {
      setSelectedId(scripts[0].id)
    }
  }, [scripts, selectedId])

  const fetchDetail = async (id: string, silent = false) => {
    if (!id) return
    if (!silent) setLoadingDetail(true)
    try {
      const res = await fetch(`/api/scripts/${id}`)
      const data = await res.json()
      if (res.ok) {
        const s: ScriptDetail = data.script
        setDetail(s)
        const latest = s.breakdowns?.[0]
        if (latest) {
          const hasLocalChange = content !== lastSavedRef.current
          if (!hasLocalChange) {
            const raw = latest.content || ''
            setContent(raw)
            lastSavedRef.current = raw
            const parsed = parseContentToSections(raw)
            setSections(parsed)
            const learn = inferLearningStatus(parsed)
            setLearningById((prev) => ({ ...prev, [id]: learn }))
            setPitfallsById((prev) => ({ ...prev, [id]: parsed.pitfalls || parsed.frequentMistakes || '' }))
            const nextTags: string[] = []
            if (parsed.hook3s.trim()) nextTags.push('前3秒')
            if (parsed.rhythm.trim()) nextTags.push('节奏')
            if (parsed.audio.trim()) nextTags.push('转场')
            if (parsed.subtitles.trim()) nextTags.push('字幕')
            if (parsed.positioning.trim() || parsed.learnings.trim()) nextTags.push('卖点')
            setTagsById((prev) => ({ ...prev, [id]: nextTags.slice(0, 5) }))
          }
        } else {
          setContent('')
          lastSavedRef.current = ''
          setSections({ ...emptySections })
          setLearningById((prev) => ({ ...prev, [id]: '待学习' }))
          setTagsById((prev) => ({ ...prev, [id]: [] }))
          setPitfallsById((prev) => ({ ...prev, [id]: '' }))
        }
      }
    } finally {
      if (!silent) setLoadingDetail(false)
    }
  }

  useEffect(() => {
    // 剪辑视图：不走后端列表，避免覆盖本地脚本
    if (isEditor) return
    // 编辑中有未保存内容时暂停轮询，避免“自动刷新”干扰输入体验
    if (hasLocalChange) return
    // 首次进入允许 loading；之后后台刷新不再触发左侧 loading
    void fetchList()
    const t = setInterval(() => fetchList(), pollMs)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery, isEditor, hasLocalChange])

  useEffect(() => {
    if (!selectedId) return
    // 剪辑视图：切换脚本时仅拉一次详情，不做轮询，避免“自动刷新覆盖输入”
    if (isEditor) {
      void fetchDetail(selectedId, false)
      return
    }
    if (hasLocalChange) return
    if (!hasLoadedDetailOnceRef.current) {
      fetchDetail(selectedId).finally(() => {
        hasLoadedDetailOnceRef.current = true
      })
    } else {
      void fetchDetail(selectedId, true)
    }
    const t = setInterval(() => fetchDetail(selectedId, true), pollMs)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isEditor, hasLocalChange])

  const handleSave = async (createNewVersion: boolean) => {
    if (!detail) return
    const nextContent = buildContentFromSections(sections)
    const updateSummary =
      window.prompt('本次更新摘要（动作导向）', createNewVersion ? '发布新版本拆解' : '更新拆解内容') || ''
    const impactScope =
      window.prompt(
        '影响范围（可选）',
        detail.productSku ? `适用于 SKU ${detail.productSku}` : '适用于假发类素材',
      ) || ''
    const impactArea =
      window.prompt('影响模块/范围（可选）', '前3秒开头 / 节奏 / 字幕 / 卖点表达') || ''
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch(`/api/scripts/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: nextContent,
          createNewVersion,
          updateSummary,
          impactScope,
          impactArea,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setContent(nextContent)
        lastSavedRef.current = nextContent
        setMessage({
          type: 'success',
          text: createNewVersion ? '已保存为新版本' : '已保存',
        })
        // 局部更新：不拉全量列表，不打断当前选中/滚动
        const nowIso = new Date().toISOString()
        const saved = data.breakdown as
          | { id: string; version: number; updatedAt?: string; content?: string }
          | undefined
        setDetail((prev) => {
          if (!prev) return prev
          const nextBreakdowns = [...(prev.breakdowns || [])]
          if (saved?.id) {
            const idx = nextBreakdowns.findIndex((b) => b.id === saved.id)
            const updatedAt = saved.updatedAt ? String(saved.updatedAt) : nowIso
            const content = saved.content !== undefined ? String(saved.content) : nextContent
            if (idx >= 0) {
              nextBreakdowns[idx] = { ...nextBreakdowns[idx], version: saved.version, updatedAt, content }
            } else {
              nextBreakdowns.unshift({
                id: saved.id,
                version: saved.version,
                updatedAt,
                content,
                editedBy: nextBreakdowns[0]?.editedBy,
              })
            }
          } else if (nextBreakdowns[0]) {
            nextBreakdowns[0] = { ...nextBreakdowns[0], content: nextContent, updatedAt: nowIso }
          }
          return { ...prev, updatedAt: nowIso, breakdowns: nextBreakdowns }
        })
        setScripts((prev) =>
          prev.map((s) =>
            s.id === detail.id
              ? {
                  ...s,
                  updatedAt: nowIso,
                  breakdowns: saved?.id
                    ? [
                        {
                          id: saved.id,
                          version: saved.version,
                          updatedAt: saved.updatedAt ? String(saved.updatedAt) : nowIso,
                          editedBy: s.breakdowns?.[0]?.editedBy,
                        },
                      ]
                    : s.breakdowns,
                }
              : s,
          ),
        )
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    if (!createTitle.trim()) return
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          platform: createPlatform.trim(),
          productSku: createSku.trim() || undefined,
          sourceUrl: createSourceUrl.trim() || undefined,
          content: '',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCreateOpen(false)
        setCreateTitle('')
        setCreateSku('')
        setCreateSourceUrl('')
        setMessage({ type: 'success', text: '已创建脚本' })
        const created = data.script as any
        if (created?.id) {
          const createdId = String(created.id)
          const createdUpdatedAt = created.updatedAt ? String(created.updatedAt) : new Date().toISOString()
          setScripts((prev) => {
            const next = [
              {
                id: createdId,
                title: String(created.title || ''),
                platform: created.platform ?? null,
                productSku: created.productSku ?? null,
                sourceUrl: created.sourceUrl ?? null,
                status: String(created.status || 'active'),
                updatedAt: createdUpdatedAt,
                breakdowns: Array.isArray(created.breakdowns)
                  ? created.breakdowns.slice(0, 1).map((b: any) => ({
                      id: String(b.id),
                      version: Number(b.version || 1),
                      updatedAt: String(b.updatedAt || createdUpdatedAt),
                      editedBy: b.editedBy || null,
                    }))
                  : [],
              } as ScriptListItem,
              ...prev.filter((s) => s.id !== createdId),
            ]
            return next
          })
          setSelectedId(createdId)
          // 详情静默拉取一次（不影响列表/选中稳定）
          void fetchDetail(createdId, true)
        }
      } else {
        setMessage({ type: 'error', text: data.error || '创建失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '创建失败' })
    } finally {
      setSaving(false)
    }
  }

  const latestMeta = detail?.breakdowns?.[0]

  // ----------------- 剪辑视图：训练执行页（与运营/管理员完全不同） -----------------
  if (isEditor) {
    const recommended = scripts
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3)

    const editorFields: { key: keyof BreakdownSections; title: string; hint?: string }[] = [
      { key: 'positioning', title: '视频定位', hint: '一句话说明：这条是给谁看的、解决什么问题、卖点是什么' },
      { key: 'hook3s', title: '前3秒拆解', hint: '开头钩子：视觉/台词/反差/结果先给' },
      { key: 'rhythm', title: '节奏拆解', hint: '每 1–2 秒发生了什么变化？哪里应该加速/删减？' },
      { key: 'shots', title: '镜头拆解', hint: '镜头顺序、景别、特写点、转场点' },
      { key: 'subtitles', title: '字幕/文案拆解', hint: '信息密度、关键句、字幕节奏、卖点表达方式' },
      { key: 'learnings', title: '我认为这条爆的原因', hint: '总结：为什么它能爆？可复用的结构是什么？' },
      { key: 'todayFocus', title: '我需要特别注意什么', hint: '你个人容易踩坑/今天要重点练的点' },
      { key: 'pitfalls', title: '常见错误', hint: '把常见错误写成 checklist（每行一条）' },
      { key: 'todayExecution', title: '今日执行要求', hint: '今天要产出什么？交付标准是什么？' },
    ]

    const trainingTopMistakes = (() => {
      const src = (sections.pitfalls || sections.frequentMistakes || '').trim()
      if (!src) return ['前 3 秒没有钩子', '节奏拖沓，镜头切换慢', '字幕信息密度不足']
      return src
        .split('\n')
        .map((s) => s.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
    })();

    const goToScript = (id?: string) => {
      if (!id) return
      setSelectedId(id)
      setEditorTab('breakdowns')
      if (isMobile) setMobilePanel('detail')
      window.setTimeout(() => {
        const el = document.getElementById('script-detail-panel')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }

    const latestId = scripts[0]?.id

    // 剪辑端：以 selectedId 为准；detail 可能尚未拉取完成，先用列表信息占位，避免空态卡住
    const selectedListItem = selectedId ? scripts.find((s) => s.id === selectedId) : null
    const selectedScript = (detail || selectedListItem)
      ? ({
          id: String((detail || selectedListItem)!.id),
          title: String((detail || selectedListItem)!.title || ''),
          platform: String(((detail as any)?.platform || (selectedListItem as any)?.platform) || 'TikTok'),
          sku: String(((detail as any)?.productSku || (selectedListItem as any)?.productSku) || ''),
          sourceUrl: String(((detail as any)?.sourceUrl || (selectedListItem as any)?.sourceUrl) || ''),
          status: String(((detail as any)?.status || (selectedListItem as any)?.status) || 'active'),
          updatedAt: String(((detail as any)?.updatedAt || (selectedListItem as any)?.updatedAt) || ''),
          tags: [],
          isLearned: (sections.learningStatus || '').includes('已掌握'),
          isPracticing: false,
          positionAnalysis: sections.positioning || '',
          hookAnalysis: sections.hook3s || '',
          rhythmAnalysis: sections.rhythm || '',
          shotAnalysis: sections.shots || '',
          subtitleAnalysis: sections.subtitles || '',
          whyItWorked: sections.learnings || '',
          whatToWatch: sections.todayFocus || '',
          commonMistakes: sections.pitfalls || '',
          todayExecution: sections.todayExecution || '',
        } as EditorScriptItem)
      : null

    const displayStatus = (s: ScriptListItem) => {
      // 后端脚本列表目前不带“学习/练习”状态，这里用是否有拆解内容做近似判断
      const hasBreakdown = (s.breakdowns?.length || 0) > 0
      return hasBreakdown ? '学习中' : '未查看'
    }

    const statusTone = (label: string) => {
      if (label === '练习中') return 'bg-blue-50 text-blue-700 border-blue-200'
      if (label === '已完成') return 'bg-green-50 text-green-700 border-green-200'
      if (label === '学习中') return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      return 'bg-gray-50 text-gray-700 border-gray-200'
    }

    const inferTags = (_s: ScriptListItem) => {
      // 列表级别先展示“结构化标签”占位（真实标签可后续存到 ViralScript.tags）
      return ['前3秒', '节奏', '镜头', '字幕', '卖点'].slice(0, 5)
    }

    const updateSelected = (patch: Partial<EditorScriptItem>) => {
      // 直接写入 sections（本地编辑），保存时再 PUT 到后端
      setSections((prev) => {
        const next = { ...prev }
        if (patch.positionAnalysis !== undefined) next.positioning = patch.positionAnalysis
        if (patch.hookAnalysis !== undefined) next.hook3s = patch.hookAnalysis
        if (patch.rhythmAnalysis !== undefined) next.rhythm = patch.rhythmAnalysis
        if (patch.shotAnalysis !== undefined) next.shots = patch.shotAnalysis
        if (patch.subtitleAnalysis !== undefined) next.subtitles = patch.subtitleAnalysis
        if (patch.whyItWorked !== undefined) next.learnings = patch.whyItWorked
        if (patch.whatToWatch !== undefined) next.todayFocus = patch.whatToWatch
        if (patch.commonMistakes !== undefined) next.pitfalls = patch.commonMistakes
        if (patch.todayExecution !== undefined) next.todayExecution = patch.todayExecution
        return next
      })
    }

    const handleCreateEditorScript = () => {
      // 直接创建后端脚本，确保跨用户同步
      void (async () => {
        if (!createTitle.trim()) return
        setSaving(true)
        setMessage({ type: '', text: '' })
        try {
          const res = await fetch('/api/scripts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: createTitle.trim(),
              platform: createPlatform.trim(),
              productSku: createSku.trim() || undefined,
              sourceUrl: createSourceUrl.trim() || undefined,
              content: '',
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '创建失败')
          const created = data.script as any
          if (created?.id) {
            const createdId = String(created.id)
            const createdUpdatedAt = created.updatedAt ? String(created.updatedAt) : new Date().toISOString()
            setScripts((prev) => {
              const next = [
                {
                  id: createdId,
                  title: String(created.title || ''),
                  platform: created.platform ?? null,
                  productSku: created.productSku ?? null,
                  sourceUrl: created.sourceUrl ?? null,
                  status: String(created.status || 'active'),
                  updatedAt: createdUpdatedAt,
                  breakdowns: Array.isArray(created.breakdowns)
                    ? created.breakdowns.slice(0, 1).map((b: any) => ({
                        id: String(b.id),
                        version: Number(b.version || 1),
                        updatedAt: String(b.updatedAt || createdUpdatedAt),
                        editedBy: b.editedBy || null,
                      }))
                    : [],
                } as ScriptListItem,
                ...prev.filter((s) => s.id !== createdId),
              ]
              return next
            })
            setSelectedId(createdId)
            void fetchDetail(createdId, true)
          }
          setCreateTitle('')
          setCreateSku('')
          setCreateSourceUrl('')
          setMessage({ type: 'success', text: '已创建脚本' })
        } catch (e: any) {
          setMessage({ type: 'error', text: e?.message || '创建失败' })
        } finally {
          setSaving(false)
        }
      })()
    }

    const handleEditorSave = () => {
      if (!detail) return
      void (async () => {
        setSaving(true)
        setMessage({ type: '', text: '' })
        try {
          const storyboardJson = (() => {
            try {
              return sections.storyboard?.trim() ? JSON.parse(sections.storyboard) : []
            } catch {
              return []
            }
          })()
          const res = await fetch(`/api/scripts/${detail.id}/analyses`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'mine',
              positionAnalysis: sections.positioning,
              hookAnalysis: sections.hook3s,
              rhythmAnalysis: sections.rhythm,
              shotAnalysis: sections.shots,
              subtitleAnalysis: sections.subtitles,
              whyItWorked: sections.learnings,
              whatToWatch: sections.todayFocus,
              commonMistakes: sections.pitfalls,
              todayExecution: sections.todayExecution,
              isLearned: (sections.learningStatus || '').includes('已掌握'),
              storyboard: storyboardJson,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || '保存失败')
          const mine = (data.mine || null) as UserAnalysis | null
          if (mine) setMyAnalysis(mine)
          setMessage({ type: 'success', text: '已保存（我的拆解）' })
        } catch (e: any) {
          setMessage({ type: 'error', text: e?.message || '保存失败' })
        } finally {
          setSaving(false)
        }
      })()
    }

    const markLearned = async () => {
      setSections((prev) => ({ ...prev, learningStatus: '已掌握' }))
      if (!detail) return
      try {
        await fetch(`/api/scripts/${detail.id}/analyses`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'mine', isLearned: true }),
        })
      } catch {
        // ignore
      }
      setMessage({ type: 'success', text: '已标记为已学习' })
    }

    const startPractice = async () => {
      if (!selectedScript) return
      // 可选：同步创建任务（后端已有 training-tasks）
      await createTaskForScript(selectedScript.id, selectedScript.title, selectedScript.sku || null)
      setMessage({ type: 'success', text: '已开始练习，并生成任务（可在「我的任务」中查看）' })
      setEditorTab('tasks')
      await fetchAllMyTasks()
    }

    const submitPractice = async () => {
      if (!selectedScript) return
      const url = window.prompt('粘贴练习成片链接（可选）', '') || ''
      // 业务状态由任务/复盘闭环体现；这里先写入提交记录
      if (url.trim()) appendSubmission(selectedScript.id, selectedScript.title, url.trim())
      if (detail) {
        try {
          await fetch(`/api/scripts/${detail.id}/analyses`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'mine', submitStatus: 'submitted', isPracticing: false }),
          })
        } catch {
          // ignore
        }
      }
      setMessage({ type: 'success', text: '已提交练习成片' })
      setEditorTab('reviews')
    }

    const viewLeadComment = () => {
      setLeadCommentOpen((v) => !v)
      window.setTimeout(() => {
        const el = document.getElementById('lead-comment-panel')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 30)
    }

    const deleteSelectedScript = () => {
      if (!selectedScript) return
      const ok = window.confirm('确认删除这条拆解脚本吗？删除后不可恢复。')
      if (!ok) return
      setMessage({ type: 'error', text: '剪辑角色暂不支持删除后端脚本，请联系管理员删除。' })
      setLeadCommentOpen(false)
      setEditorMoreOpen(false)
    }

    const savePracticeUrlForScript = async (scriptId: string, url: string) => {
      try {
        const res = await fetch(`/api/scripts/${scriptId}`)
        const data = await res.json()
        if (!res.ok) return
        const s: ScriptDetail = data.script
        const latest = s.breakdowns?.[0]
        const parsed = parseContentToSections(latest?.content || '')
        parsed.practiceUrl = url.trim()
        const contentNext = buildContentFromSections(parsed)
        await fetch(`/api/scripts/${scriptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: contentNext,
            createNewVersion: false,
            updateSummary: '提交练习成片链接',
            impactScope: '',
            impactArea: '',
          }),
        })
      } catch {
        // ignore
      }
    }

    const taskStatusLabel = (s: string) => {
      if (s === 'todo') return '未开始'
      if (s === 'in_progress') return '进行中'
      if (s === 'submitted') return '已提交'
      if (s === 'review') return '待点评'
      if (s === 'done') return '已完成'
      return s
    }

    const taskTone = (s: string) => {
      if (s === 'todo') return 'bg-gray-50 text-gray-700 border-gray-200'
      if (s === 'in_progress') return 'bg-blue-50 text-blue-700 border-blue-200'
      if (s === 'submitted') return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      if (s === 'review') return 'bg-purple-50 text-purple-700 border-purple-200'
      if (s === 'done') return 'bg-green-50 text-green-700 border-green-200'
      return 'bg-gray-50 text-gray-700 border-gray-200'
    }

    const breakdownList = scripts.filter((s) => {
      const q = search.trim()
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q.toLowerCase()) ||
        String(s.platform || '').toLowerCase().includes(q.toLowerCase()) ||
        String(s.productSku || '').toLowerCase().includes(q.toLowerCase())
      )
    })

    const recentSubmissions = (() => {
      return submissions.slice(0, 12).map((r) => ({
        id: r.id,
        title: r.scriptTitle,
        scriptId: r.scriptId,
        updatedAt: r.submittedAt,
        practiceUrl: r.practiceUrl,
      }))
    })();

    const masteredScripts = scripts.slice(0, 20)

    const topRecurringIssues = (() => {
      const lines: string[] = []
      const values = Object.values(pitfallsById || {})
      for (const v of values) {
        const arr = String(v || '')
          .split('\n')
          .map((s) => s.replace(/^\s*[-*]\s*/, '').trim())
          .filter(Boolean)
        lines.push(...arr)
      }
      const count = new Map<string, number>()
      for (const l of lines) count.set(l, (count.get(l) || 0) + 1)
      return Array.from(count.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([text, n]) => ({ text, n }))
    })();

    ;return (
      <div className="space-y-5">
        {message.text && (
          <div
            className={`p-3 rounded-lg text-xs ${
              message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">剪辑爆款拆解与训练工作台</h1>
              <p className="mt-1 text-sm text-gray-600">
                学习别人拆好的爆款脚本，也能自己新建拆解、沉淀方法，并结合任务与复盘完成训练闭环。
              </p>
            </div>
              <div className="flex flex-col items-start md:items-end gap-2">
              <div className="flex gap-2 overflow-x-auto flex-nowrap md:flex-wrap md:overflow-visible w-full md:w-auto pr-1">
                <button
                  onClick={() => setEditorTab('breakdowns')}
                  className={`shrink-0 px-3 py-2 text-xs rounded-lg border transition ${
                    editorTab === 'breakdowns'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  脚本拆解
                </button>
                <button
                  onClick={() => setEditorTab('tasks')}
                  className={`shrink-0 px-3 py-2 text-xs rounded-lg border transition ${
                    editorTab === 'tasks'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  我的任务
                </button>
                <button
                  onClick={() => setEditorTab('reviews')}
                  className={`shrink-0 px-3 py-2 text-xs rounded-lg border transition ${
                    editorTab === 'reviews'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  我的复盘
                </button>
                <button
                  onClick={() => setEditorTab('inspirations')}
                  className={`shrink-0 px-3 py-2 text-xs rounded-lg border transition ${
                    editorTab === 'inspirations'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  灵感本
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobilePanel('list')
                    window.setTimeout(() => {
                      const el = document.getElementById('create-script-card')
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 50)
                  }}
                  className="md:hidden px-3 py-2 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                  新建脚本
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickStoryboardOpen(true)
                    resetQuickStoryboardForm()
                  }}
                  disabled={!selectedId}
                  className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  快速记分镜（搭骨架）
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('inspirations')}
                  className="md:hidden px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                >
                  灵感本
                </button>
                <button
                  onClick={() => goToScript(recommended[0]?.id)}
                  disabled={!recommended[0]?.id}
                  className="hidden md:inline-flex px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  今日推荐学习
                </button>
                <button
                  onClick={() => goToScript(latestId)}
                  disabled={!latestId}
                  className="hidden md:inline-flex px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  最近更新
                </button>
              </div>
            </div>
          </div>
        </div>

        {editorTab === 'breakdowns' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 左侧：列表 + 轻量新建 */}
            <div className={`lg:col-span-3 space-y-4 ${isMobile && mobilePanel === 'detail' ? 'hidden' : ''}`}>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">脚本列表</div>
                <div className="mt-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索标题 / 平台 / SKU"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {isInitializingScripts && scripts.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">加载中...</div>
                  ) : breakdownList.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">暂无脚本</div>
                  ) : (
                    breakdownList.map((s) => {
                      const status = displayStatus(s)
                      const tags = inferTags(s)
                      return (
                        <button
                          key={s.id}
                          onClick={() => goToScript(s.id)}
                          className={`w-full text-left rounded-lg border px-3 py-2 hover:bg-gray-50 transition ${
                            selectedId === s.id
                              ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-200'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{s.title}</div>
                              <div className="mt-1 text-[11px] text-gray-500">
                                {s.platform || '—'} · {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${statusTone(
                                status,
                              )}`}
                            >
                              {status}
                            </span>
                          </div>
                          {tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {tags.slice(0, 5).map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-white text-gray-700 border-gray-200"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <div id="create-script-card" className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">新建拆解脚本</div>
                  <button
                    onClick={() => {
                      setCreateTitle('')
                      setCreateSku('')
                      setCreateSourceUrl('')
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    清空
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="脚本标题（必填）"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={createPlatform}
                      onChange={(e) => setCreatePlatform(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                    >
                      <option value="TikTok">TikTok</option>
                      <option value="Instagram">Instagram</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      value={createSku}
                      onChange={(e) => setCreateSku(e.target.value)}
                      placeholder="关联 SKU（可选）"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <input
                    value={createSourceUrl}
                    onChange={(e) => setCreateSourceUrl(e.target.value)}
                    placeholder="来源链接（可选）"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateEditorScript}
                    disabled={saving || !createTitle.trim()}
                    className="flex-1 px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    创建
                  </button>
                  <button
                    onClick={() => {
                      setCreateTitle('')
                      setCreateSku('')
                      setCreateSourceUrl('')
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>

            {/* 中间：拆解详情（可编辑） */}
            <div
              id="script-detail-panel"
              className={`lg:col-span-6 space-y-4 ${isMobile && mobilePanel === 'list' ? 'hidden' : ''}`}
            >
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {selectedScript?.title ? `拆解：${selectedScript.title}` : '选择一条脚本开始拆解'}
                    </div>
                    {isMobile && mobilePanel === 'detail' && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setMobilePanel('list')}
                          className="inline-flex items-center px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                        >
                          ← 返回脚本列表
                        </button>
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-gray-500">
                      {selectedScript?.platform || '—'} · SKU {selectedScript?.sku || '—'} · 学习状态：
                      {inferLearningStatus(sections)}
                    </div>
                    {selectedScript && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAnalysisView('standard')}
                          className={`px-2.5 py-1.5 text-xs rounded-lg border transition ${
                            analysisView === 'standard'
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          标准拆解
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalysisView('mine')}
                          className={`px-2.5 py-1.5 text-xs rounded-lg border transition ${
                            analysisView === 'mine'
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          我的拆解
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalysisView('team')}
                          className={`px-2.5 py-1.5 text-xs rounded-lg border transition ${
                            analysisView === 'team'
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          团队拆解
                        </button>
                        {analysisLoading && <span className="text-[11px] text-gray-400 ml-2">同步中…</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="w-full md:w-auto flex items-center gap-2">
                      <div className="text-[11px] text-gray-500">内容动作</div>
                      <button
                        onClick={() => handleEditorSave()}
                        disabled={!selectedScript || saving}
                        className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        {saving ? '保存中...' : '保存拆解'}
                      </button>
                    </div>
                    <div className="w-full md:w-auto rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-gray-500">训练动作</div>
                        <div className="flex flex-wrap gap-2 justify-end">
                          <button
                            onClick={markLearned}
                            disabled={!selectedScript || saving}
                            className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            标记已学习
                          </button>
                          <button
                            onClick={startPractice}
                            disabled={!selectedScript}
                            className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            开始练习
                          </button>
                          <button
                            onClick={submitPractice}
                            disabled={!selectedScript}
                            className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            提交练习成片
                          </button>
                          <button
                            onClick={viewLeadComment}
                            disabled={!selectedScript}
                            className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            查看负责人点评
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {!selectedId ? (
                  <div className="py-8 text-center text-sm text-gray-500">从左侧选择一个脚本，或新建一条。</div>
                ) : !selectedScript ? (
                  <div className="py-8 text-center text-sm text-gray-500">正在加载脚本详情…</div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {analysisView === 'mine' && !myAnalysis && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="text-sm font-semibold text-amber-900">你还没有这条脚本的个人拆解</div>
                        <div className="mt-1 text-[11px] text-amber-800/80">
                          点击开始后会为你创建一份“我的拆解”草稿，你的编辑不会覆盖标准拆解或他人拆解。
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                              onClick={() => void startMyAnalysis(detail?.id || selectedId)}
                            disabled={analysisLoading}
                            className="px-3 py-2 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            开始我的拆解
                          </button>
                        </div>
                      </div>
                    )}

                    {analysisView === 'standard' && (
                      <div className="rounded-xl border border-gray-100 bg-white">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">标准拆解（参考）</div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              负责人/运营提供的标准版本，默认只读
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {standardAnalysis?.updatedAt
                              ? `更新于 ${new Date(standardAnalysis.updatedAt).toLocaleString('zh-CN')}`
                              : '暂无标准拆解'}
                          </div>
                        </div>
                        <div className="p-4 grid grid-cols-1 gap-3 text-sm">
                          {standardAnalysis ? (
                            <>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">视频定位</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.positionAnalysis || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">前3秒拆解</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.hookAnalysis || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">节奏拆解</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.rhythmAnalysis || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">镜头拆解</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.shotAnalysis || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">字幕/文案拆解</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.subtitleAnalysis || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">为什么会爆</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.whyItWorked || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">注意事项</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.whatToWatch || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">常见错误</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.commonMistakes || '—'}
                                </div>
                              </div>
                              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="text-[11px] text-gray-500">今日执行要求</div>
                                <div className="mt-1 whitespace-pre-wrap text-gray-800">
                                  {standardAnalysis.todayExecution || '—'}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-gray-500">暂无标准拆解。</div>
                          )}
                        </div>
                      </div>
                    )}

                    {analysisView === 'team' && (
                      <div className="rounded-xl border border-gray-100 bg-white">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <div className="text-sm font-semibold text-gray-900">团队拆解</div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            查看其他成员对同一条脚本的拆解版本（只读）
                          </div>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-1 space-y-2">
                            {teamAnalyses.length === 0 ? (
                              <div className="text-xs text-gray-500">暂无团队拆解。</div>
                            ) : (
                              teamAnalyses.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => setTeamSelectedUserId(a.userId)}
                                  className={`w-full text-left rounded-lg border px-3 py-2 hover:bg-gray-50 ${
                                    (teamSelectedUserId ? teamSelectedUserId === a.userId : false)
                                      ? 'border-primary-300 bg-primary-50'
                                      : 'border-gray-200 bg-white'
                                  }`}
                                >
                                  <div className="text-xs font-medium text-gray-900">{a.userName || a.userId}</div>
                                  <div className="mt-1 text-[11px] text-gray-500">
                                    {new Date(a.updatedAt).toLocaleString('zh-CN')}
                                  </div>
                                  <div className="mt-1 text-[11px] text-gray-500">状态：{a.submitStatus}</div>
                                </button>
                              ))
                            )}
                          </div>
                          <div className="md:col-span-2">
                            {(() => {
                              const picked =
                                (teamSelectedUserId
                                  ? teamAnalyses.find((x) => x.userId === teamSelectedUserId)
                                  : teamAnalyses[0]) || null
                              if (!picked) return <div className="text-xs text-gray-500">请选择一个成员查看拆解。</div>
                              return (
                                <div className="space-y-3">
                                  <div className="text-xs text-gray-500">
                                    当前查看：<span className="text-gray-900 font-medium">{picked.userName || picked.userId}</span>
                                  </div>
                                  {[
                                    ['视频定位', picked.positionAnalysis],
                                    ['前3秒拆解', picked.hookAnalysis],
                                    ['节奏拆解', picked.rhythmAnalysis],
                                    ['镜头拆解', picked.shotAnalysis],
                                    ['字幕/文案拆解', picked.subtitleAnalysis],
                                    ['为什么会爆', picked.whyItWorked],
                                    ['注意事项', picked.whatToWatch],
                                    ['常见错误', picked.commonMistakes],
                                    ['今日执行要求', picked.todayExecution],
                                  ].map(([label, val]) => (
                                    <div key={String(label)} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                      <div className="text-[11px] text-gray-500">{label}</div>
                                      <div className="mt-1 whitespace-pre-wrap text-gray-800 text-sm">{String(val || '—')}</div>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {analysisView === 'mine' && (
                    <div className="space-y-4">
                    <div className="rounded-xl border border-gray-100 bg-white">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">A. 基础判断</div>
                        <div className="mt-1 text-[11px] text-gray-500">视频定位 / 爆的原因 / 注意事项</div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">视频定位</div>
                            <div className="text-[11px] text-gray-500">给谁看 / 场景 / 卖点</div>
                          </div>
                          <textarea
                            value={selectedScript.positionAnalysis}
                            onChange={(e) => updateSelected({ positionAnalysis: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「视频定位」…"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">我认为这条爆的原因</div>
                            <div className="text-[11px] text-gray-500">可复用结构 / 关键因子</div>
                          </div>
                          <textarea
                            value={selectedScript.whyItWorked}
                            onChange={(e) => updateSelected({ whyItWorked: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「我认为这条爆的原因」…"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">我需要特别注意什么</div>
                            <div className="text-[11px] text-gray-500">个人易踩坑 / 今日重点</div>
                          </div>
                          <textarea
                            value={selectedScript.whatToWatch}
                            onChange={(e) => updateSelected({ whatToWatch: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「我需要特别注意什么」…"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">B. 结构拆解</div>
                        <div className="mt-1 text-[11px] text-gray-500">前3秒 / 节奏 / 镜头 / 字幕文案</div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">前3秒拆解</div>
                            <div className="text-[11px] text-gray-500">开头钩子</div>
                          </div>
                          <textarea
                            value={selectedScript.hookAnalysis}
                            onChange={(e) => updateSelected({ hookAnalysis: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「前3秒拆解」…"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">节奏拆解</div>
                            <div className="text-[11px] text-gray-500">1–2 秒变化点</div>
                          </div>
                          <textarea
                            value={selectedScript.rhythmAnalysis}
                            onChange={(e) => updateSelected({ rhythmAnalysis: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「节奏拆解」…"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">镜头拆解</div>
                            <div className="text-[11px] text-gray-500">顺序 / 景别 / 特写点</div>
                          </div>
                          <textarea
                            value={selectedScript.shotAnalysis}
                            onChange={(e) => updateSelected({ shotAnalysis: e.target.value })}
                            rows={6}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「镜头拆解」…"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">字幕/文案拆解</div>
                            <div className="text-[11px] text-gray-500">密度 / 关键词 / 口播与画面关系</div>
                          </div>
                          <textarea
                            value={selectedScript.subtitleAnalysis}
                            onChange={(e) => updateSelected({ subtitleAnalysis: e.target.value })}
                            rows={5}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「字幕/文案拆解」…"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">C. 执行输出</div>
                        <div className="mt-1 text-[11px] text-gray-500">常见错误 / 今日执行要求</div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">常见错误</div>
                            <div className="text-[11px] text-gray-500">每行一条 checklist</div>
                          </div>
                          <textarea
                            value={selectedScript.commonMistakes}
                            onChange={(e) => updateSelected({ commonMistakes: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「常见错误」…"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900">今日执行要求</div>
                            <div className="text-[11px] text-gray-500">产出 / 标准</div>
                          </div>
                          <textarea
                            value={selectedScript.todayExecution}
                            onChange={(e) => updateSelected({ todayExecution: e.target.value })}
                            rows={4}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-pre-wrap"
                            placeholder="在这里填写「今日执行要求」…"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 分镜执行表 */}
                    <div className="rounded-xl border border-gray-100 bg-white">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">分镜执行表</div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            将脚本拆成可执行镜头，方便拍摄与剪辑落地
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setQuickStoryboardOpen(true)
                              resetQuickStoryboardForm()
                            }}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-800 bg-white hover:bg-gray-50"
                          >
                            快速记分镜（搭骨架）
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              persistStoryboard((prev) =>
                                normalizeStoryboard([
                                  ...prev,
                                  {
                                    id: `sb_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`,
                                    order: prev.length + 1,
                                    shotNo: String(prev.length + 1),
                                    frameImage: '',
                                    shotType: '',
                                    durationSec: 0,
                                    content: '',
                                    note: '',
                                  },
                                ]),
                              )
                            }
                            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-primary-200 text-xs text-primary-700 bg-primary-50 hover:bg-primary-100"
                          >
                            + 新增分镜
                          </button>
                        </div>
                      </div>
                      <div className="p-4 overflow-x-auto">
                        {storyboard.length === 0 ? (
                          <div className="text-xs text-gray-500">
                            暂无分镜。你可以点击右上角「新增分镜」，按拍摄顺序逐条补充。
                          </div>
                        ) : (
                          <table className="min-w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50 text-gray-500">
                                <th className="px-2 py-1.5 w-6 text-center">⇅</th>
                                <th className="px-2 py-1.5 w-10">排序</th>
                                <th className="px-2 py-1.5 w-12">镜号</th>
                                <th className="px-2 py-1.5 w-32">画面</th>
                                <th className="px-2 py-1.5 w-20">景别</th>
                                <th className="px-2 py-1.5 w-20">时长（秒）</th>
                                <th className="px-2 py-1.5">内容</th>
                                <th className="px-2 py-1.5 w-40">备注</th>
                                <th className="px-2 py-1.5 w-12" />
                              </tr>
                            </thead>
                            <tbody>
                              {storyboard.map((row, idx) => (
                                <tr
                                  key={row.id}
                                  className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer ${
                                    activeStoryboardId === row.id ? 'bg-primary-50' : ''
                                  }`}
                                  onClick={() => setActiveStoryboardId(row.id)}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move'
                                    e.dataTransfer.setData('text/plain', row.id)
                                    setDraggingStoryboardId(row.id)
                                    ;(e.currentTarget as any).style.opacity = '0.6'
                                  }}
                                  onDragEnd={(e) => {
                                    setDraggingStoryboardId('')
                                    ;(e.currentTarget as any).style.opacity = '1'
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault()
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault()
                                    const draggingId = e.dataTransfer.getData('text/plain') || draggingStoryboardId
                                    const fromIndex = storyboard.findIndex((r) => r.id === draggingId)
                                    const toIndex = idx
                                    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
                                    persistStoryboard((prev) => {
                                      const arr = [...prev]
                                      const [moved] = arr.splice(fromIndex, 1)
                                      arr.splice(toIndex, 0, moved)
                                      return normalizeStoryboard(arr)
                                    })
                                  }}
                                  id={row.id}
                                >
                                  <td className="px-2 py-1.5 text-center cursor-move text-gray-400 select-none">⋮⋮</td>
                                  <td className="px-2 py-1.5 text-center text-gray-600">{idx + 1}</td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      value={row.shotNo}
                                      onChange={(e) =>
                                        persistStoryboard((prev) =>
                                          prev.map((it) =>
                                            it.id === row.id ? { ...it, shotNo: e.target.value } : it,
                                          ),
                                        )
                                      }
                                      className="w-full px-1 py-1 border border-gray-200 rounded"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <button
                                      type="button"
                                      className={`w-20 h-12 border border-dashed rounded flex items-center justify-center text-[11px] ${
                                        row.frameImage ? 'bg-gray-100 border-gray-300' : 'border-gray-300 text-gray-400'
                                      }`}
                                      onClick={() => {
                                        const url = window.prompt('粘贴参考图链接（可选）', row.frameImage || '')
                                        if (url === null) return
                                        persistStoryboard((prev) =>
                                          prev.map((it) =>
                                            it.id === row.id ? { ...it, frameImage: url.trim() } : it,
                                          ),
                                        )
                                      }}
                                    >
                                      {row.frameImage ? '已设置参考图' : '+ 参考图'}
                                    </button>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select
                                      value={row.shotType}
                                      onChange={(e) =>
                                        persistStoryboard((prev) =>
                                          prev.map((it) =>
                                            it.id === row.id ? { ...it, shotType: e.target.value } : it,
                                          ),
                                        )
                                      }
                                      className="w-full px-1 py-1 border border-gray-200 rounded bg-white"
                                    >
                                      <option value="">选择</option>
                                      <option value="近景">近景</option>
                                      <option value="中景">中景</option>
                                      <option value="特写">特写</option>
                                      <option value="全景">全景</option>
                                      <option value="远景">远景</option>
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      value={Number.isFinite(row.durationSec) ? row.durationSec : 0}
                                      onChange={(e) =>
                                        persistStoryboard((prev) =>
                                          prev.map((it) =>
                                            it.id === row.id
                                              ? { ...it, durationSec: Number(e.target.value) || 0 }
                                              : it,
                                          ),
                                        )
                                      }
                                      className="w-full px-1 py-1 border border-gray-200 rounded text-right"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <textarea
                                      value={row.content}
                                      onChange={(e) =>
                                        persistStoryboard((prev) =>
                                          prev.map((it) =>
                                            it.id === row.id ? { ...it, content: e.target.value } : it,
                                          ),
                                        )
                                      }
                                      rows={2}
                                      className="w-full px-1 py-1 border border-gray-200 rounded resize-none"
                                      placeholder="画面要拍什么、台词/动作要点…"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <textarea
                                      value={row.note}
                                      onChange={(e) =>
                                        persistStoryboard((prev) =>
                                          prev.map((it) =>
                                            it.id === row.id ? { ...it, note: e.target.value } : it,
                                          ),
                                        )
                                      }
                                      rows={2}
                                      className="w-full px-1 py-1 border border-gray-200 rounded resize-none"
                                      placeholder="注意事项、字幕提示、转场说明等…"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const ok =
                                          storyboard.length <= 1
                                            ? true
                                            : window.confirm('确认删除该分镜吗？')
                                        if (!ok) return
                                        persistStoryboard((prev) => prev.filter((it) => it.id !== row.id))
                                      }}
                                      className="text-[11px] text-red-500 hover:text-red-700"
                                    >
                                      删除
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                    </div>
                    )}

                    {quickStoryboardOpen && (
                      <div className="fixed inset-0 z-50">
                        <div className="absolute inset-0 bg-black/30" onClick={() => setQuickStoryboardOpen(false)} />
                        <div className="absolute inset-0 flex items-start justify-center p-4 overflow-y-auto">
                          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border border-gray-200 max-h-[85vh] flex flex-col overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold text-gray-900">快速分镜草稿（搭骨架）</div>
                                <div className="mt-1 text-[11px] text-gray-500">
                                  先把整条视频镜头顺下来（默认 5 行，可增删），保存后会写入「分镜执行表」。
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setQuickStoryboardOpen(false)}
                                className="text-xs text-gray-500 hover:text-gray-800"
                              >
                                关闭
                              </button>
                            </div>

                            <div className="p-4 overflow-y-auto flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-gray-500">
                                  每行一条镜头。景别选项：近景 / 中景 / 特写 / 全景 / 远景
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuickDraftRows((prev) => [
                                        ...prev,
                                        {
                                          id: `qd_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`,
                                          shotNo: String(prev.length + 1),
                                          content: '',
                                          shotType: '',
                                          durationSec: '',
                                          note: '',
                                        },
                                      ])
                                    }}
                                    className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                                  >
                                    + 新增行
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3 overflow-x-auto">
                                <table className="min-w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-500">
                                      <th className="px-2 py-1.5 w-12">镜号</th>
                                      <th className="px-2 py-1.5">镜头内容</th>
                                      <th className="px-2 py-1.5 w-20">景别</th>
                                      <th className="px-2 py-1.5 w-20">时长（秒）</th>
                                      <th className="px-2 py-1.5 w-40">备注</th>
                                      <th className="px-2 py-1.5 w-10" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {quickDraftRows.map((r) => (
                                      <tr key={r.id} className="border-t border-gray-100">
                                        <td className="px-2 py-1.5">
                                          <input
                                            value={r.shotNo}
                                            onChange={(e) =>
                                              setQuickDraftRows((prev) =>
                                                prev.map((x) => (x.id === r.id ? { ...x, shotNo: e.target.value } : x)),
                                              )
                                            }
                                            className="w-full px-1 py-1 border border-gray-200 rounded"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <textarea
                                            value={r.content}
                                            onChange={(e) =>
                                              setQuickDraftRows((prev) =>
                                                prev.map((x) => (x.id === r.id ? { ...x, content: e.target.value } : x)),
                                              )
                                            }
                                            rows={2}
                                            className="w-full px-1 py-1 border border-gray-200 rounded resize-none"
                                            placeholder="写下镜头要拍什么…"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <select
                                            value={r.shotType}
                                            onChange={(e) =>
                                              setQuickDraftRows((prev) =>
                                                prev.map((x) =>
                                                  x.id === r.id ? { ...x, shotType: e.target.value } : x,
                                                ),
                                              )
                                            }
                                            className="w-full px-1 py-1 border border-gray-200 rounded bg-white"
                                          >
                                            <option value="">选择</option>
                                            <option value="近景">近景</option>
                                            <option value="中景">中景</option>
                                            <option value="特写">特写</option>
                                            <option value="全景">全景</option>
                                            <option value="远景">远景</option>
                                          </select>
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            value={r.durationSec}
                                            onChange={(e) =>
                                              setQuickDraftRows((prev) =>
                                                prev.map((x) =>
                                                  x.id === r.id ? { ...x, durationSec: e.target.value } : x,
                                                ),
                                              )
                                            }
                                            inputMode="decimal"
                                            className="w-full px-1 py-1 border border-gray-200 rounded text-right"
                                            placeholder="0"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <textarea
                                            value={r.note}
                                            onChange={(e) =>
                                              setQuickDraftRows((prev) =>
                                                prev.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)),
                                              )
                                            }
                                            rows={2}
                                            className="w-full px-1 py-1 border border-gray-200 rounded resize-none"
                                            placeholder="转场/字幕提示…"
                                          />
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setQuickDraftRows((prev) => prev.filter((x) => x.id !== r.id))
                                            }
                                            className="text-[11px] text-red-500 hover:text-red-700"
                                          >
                                            删
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0 bg-white">
                              <button
                                type="button"
                                onClick={() => setQuickStoryboardOpen(false)}
                                className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const rows = quickDraftRows
                                    .map((r, idx) => ({
                                      ...r,
                                      shotNo: String(r.shotNo || idx + 1).trim(),
                                      content: String(r.content || '').trim(),
                                      shotType: String(r.shotType || '').trim(),
                                      durationSec: String(r.durationSec || '').trim(),
                                      note: String(r.note || '').trim(),
                                    }))
                                    .filter((r) => r.content)
                                  if (rows.length === 0) {
                                    setMessage({ type: 'error', text: '至少填写一行「镜头内容」' })
                                    return
                                  }
                                  const next: StoryboardItem[] = rows.map((r, idx) => ({
                                    id: `sb_${Date.now().toString(16)}_${idx}_${Math.random().toString(16).slice(2)}`,
                                    order: idx + 1,
                                    shotNo: r.shotNo || String(idx + 1),
                                    frameImage: '',
                                    shotType: r.shotType || '',
                                    durationSec: (() => {
                                      const v = Number(r.durationSec)
                                      return Number.isFinite(v) && v > 0 ? v : 0
                                    })(),
                                    content: r.content,
                                    note: r.note || '',
                                  }))
                                  persistStoryboard(() => normalizeStoryboard(next))
                                  setQuickStoryboardOpen(false)
                                  resetQuickStoryboardForm()
                                  setMessage({ type: 'success', text: '已覆盖写入分镜执行表（骨架已生成）' })
                                }}
                                className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                              >
                                覆盖写入
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const rows = quickDraftRows
                                    .map((r, idx) => ({
                                      ...r,
                                      shotNo: String(r.shotNo || idx + 1).trim(),
                                      content: String(r.content || '').trim(),
                                      shotType: String(r.shotType || '').trim(),
                                      durationSec: String(r.durationSec || '').trim(),
                                      note: String(r.note || '').trim(),
                                    }))
                                    .filter((r) => r.content)
                                  if (rows.length === 0) {
                                    setMessage({ type: 'error', text: '至少填写一行「镜头内容」' })
                                    return
                                  }
                                  const nextBatch: StoryboardItem[] = rows.map((r, idx) => ({
                                    id: `sb_${Date.now().toString(16)}_${idx}_${Math.random().toString(16).slice(2)}`,
                                    order: idx + 1,
                                    shotNo: r.shotNo || String(idx + 1),
                                    frameImage: '',
                                    shotType: r.shotType || '',
                                    durationSec: (() => {
                                      const v = Number(r.durationSec)
                                      return Number.isFinite(v) && v > 0 ? v : 0
                                    })(),
                                    content: r.content,
                                    note: r.note || '',
                                  }))
                                  persistStoryboard((prev) => normalizeStoryboard([...prev, ...nextBatch]))
                                  setQuickStoryboardOpen(false)
                                  resetQuickStoryboardForm()
                                  setMessage({ type: 'success', text: '已追加到分镜执行表（骨架已加入表尾）' })
                                }}
                                className="px-3 py-2 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                              >
                                追加到表尾
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div id="lead-comment-block" className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">负责人点评</div>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                  {'（示例）开头钩子可以更“结果先给”；第 6 秒开始节奏拖了，建议删 1 个过渡镜头；字幕卖点句更短更硬。'}
                </div>
              </div>
            </div>

            {/* 右侧：训练引导信息 */}
            <div className={`lg:col-span-3 space-y-4 ${isMobile && mobilePanel === 'list' ? 'hidden' : ''}`}>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">当前脚本训练卡</div>
                {!selectedScript ? (
                  <div className="mt-2 text-sm text-gray-500">选择一条脚本后，右侧会优先展示与当前脚本相关的重点与反馈。</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="text-[11px] text-gray-500">当前脚本训练重点</div>
                      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                        {selectedScript.todayExecution.trim() ||
                          selectedScript.whatToWatch.trim() ||
                          '建议：先把“前3秒钩子 + 节奏拆解”各做 1 次对照练习。'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="text-[11px] text-gray-500">当前脚本负责人点评</div>
                      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                        {`摘要：${leadCommentItems[0]}。`}
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={viewLeadComment}
                          className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
                        >
                          {leadCommentOpen ? '收起点评' : '查看负责人点评'}
                        </button>
                      </div>
                      {leadCommentOpen && (
                        <div id="lead-comment-panel" className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                          <div className="text-[11px] font-medium text-gray-900">完整点评</div>
                          <div className="mt-2 space-y-2">
                            {leadCommentItems.map((t, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-sm text-gray-800">
                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-50 text-gray-700 text-[11px] border border-gray-200">
                                  {idx + 1}
                                </span>
                                <div className="whitespace-pre-wrap">{t}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="text-[11px] text-gray-500">当前脚本常见错误</div>
                      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                        {selectedScript.commonMistakes.trim() || '暂无。建议把常见错误写成 checklist。'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="text-[11px] text-gray-500">类似优秀案例</div>
                      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                        {selectedScript.whyItWorked.trim()
                          ? `可类比：${selectedScript.whyItWorked.split('\n')[0].slice(0, 60)}…`
                          : '建议：找 1 条同类爆款，对照“钩子/节奏/字幕密度”。'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">今日推荐学习</div>
                  <div className="text-[11px] text-gray-500">优先最新更新</div>
                </div>
                <div className="mt-3 space-y-2">
                  {recommended.length === 0 ? (
                    <div className="text-xs text-gray-500">暂无推荐</div>
                  ) : (
                    recommended.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => goToScript(s.id)}
                        className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="text-sm font-medium text-gray-900 truncate">{s.title}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {s.platform || '—'} · {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">最近更新的拆解方法</div>
                <div className="mt-3 space-y-2">
                  {(todayLogs || []).slice(0, 6).map((l) => (
                    <div key={l.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-900">{l.summary}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {l.createdByNameSnapshot || '—'} · {l.createdByRoleSnapshot || '—'} ·{' '}
                        {new Date(l.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  ))}
                  {todayLogs.length === 0 && <div className="text-xs text-gray-500">今天暂无更新动态。</div>}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">常见错误 TOP 3</div>
                <div className="mt-3 space-y-2">
                  {trainingTopMistakes.map((t, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-700 text-[11px] border border-red-100">
                        {idx + 1}
                      </span>
                      <div className="text-gray-800">{t}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">本周优秀案例</div>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                  {sections.goodPatterns || '建议：沉淀一个“开头钩子模板”，本周至少复用 3 次并对比效果。'}
                </div>
              </div>
            </div>
          </div>
        )}

        {editorTab === 'tasks' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">我的任务</div>
                <div className="mt-1 text-[11px] text-gray-500">包含历史任务（date=all）。</div>
              </div>
              <button
                onClick={fetchAllMyTasks}
                className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
              >
                刷新
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-3 font-medium">任务</th>
                    <th className="text-left py-2 pr-3 font-medium">关联脚本</th>
                    <th className="text-left py-2 pr-3 font-medium">截止</th>
                    <th className="text-left py-2 pr-3 font-medium">负责人</th>
                    <th className="text-left py-2 pr-3 font-medium">状态</th>
                    <th className="text-right py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAllTasks ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        加载中...
                      </td>
                    </tr>
                  ) : allTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        暂无任务。你可以在某条脚本中点击「开始练习」生成任务。
                      </td>
                    </tr>
                  ) : (
                    allTasks.map((t) => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 pr-3">
                          <div className="font-medium text-gray-900">{t.title}</div>
                          {(t.focus || t.requirement) && (
                            <div className="mt-1 text-[11px] text-gray-500 line-clamp-2">
                              {(t.focus || '').trim()} {(t.requirement || '').trim()}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {t.script ? (
                            <button onClick={() => goToScript(t.script!.id)} className="text-left hover:underline">
                              <div className="text-gray-900">{t.script.title}</div>
                              <div className="mt-1 text-[11px] text-gray-500">
                                {t.script.platform || '—'} · SKU {t.script.productSku || '—'}
                              </div>
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-gray-700">
                          {t.dueAt ? new Date(t.dueAt).toLocaleString('zh-CN') : '—'}
                        </td>
                        <td className="py-3 pr-3 text-gray-700">
                          {t.owner?.name || t.owner?.email || '—'}
                        </td>
                        <td className="py-3 pr-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${taskTone(t.status)}`}>
                            {taskStatusLabel(t.status)}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => updateTask(t.id, { status: 'in_progress' })}
                              disabled={t.status === 'in_progress' || t.status === 'done'}
                              className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                              开始任务
                            </button>
                            <button
                              onClick={async () => {
                                const url = window.prompt('粘贴成片链接（可选）', '') || ''
                                await updateTask(t.id, { status: 'submitted' })
                                if (t.script?.id && url.trim()) {
                                  await savePracticeUrlForScript(t.script.id, url.trim())
                                  appendSubmission(t.script.id, t.script.title, url.trim())
                                }
                                await fetchAllMyTasks()
                                setEditorTab('reviews')
                              }}
                              disabled={t.status === 'done'}
                              className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                              提交成片
                            </button>
                            <button
                              onClick={() => {
                                if (t.script?.id) goToScript(t.script.id)
                                else viewLeadComment()
                              }}
                              className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
                            >
                              查看点评
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {editorTab === 'reviews' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">最近提交记录</div>
                  <button
                    onClick={() => {
                      fetchAllMyTasks()
                      fetchList()
                    }}
                    className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
                  >
                    刷新
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {recentSubmissions.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      还没有提交记录。你可以在脚本详情里填写「练习成片链接」，或在「我的任务」里点击「提交成片」。
                    </div>
                  ) : (
                    recentSubmissions.map((r) => (
                      <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              更新于 {new Date(r.updatedAt).toLocaleString('zh-CN')}
                            </div>
                          </div>
                          <button
                            onClick={() => goToScript(r.scriptId)}
                            className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
                          >
                            打开
                          </button>
                        </div>
                        <div className="mt-2 text-[11px] text-gray-600 break-all">{r.practiceUrl}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">负责人点评（当前脚本）</div>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                  {sections.leadComment || '暂无点评。'}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">已掌握脚本</div>
                <div className="mt-3 space-y-2">
                  {masteredScripts.length === 0 ? (
                    <div className="text-sm text-gray-500">暂无。你可以在脚本详情点击「标记已学习」。</div>
                  ) : (
                    masteredScripts.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => goToScript(s.id)}
                        className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="text-sm font-medium text-gray-900 truncate">{s.title}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {s.platform || '—'} · {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">反复出现的问题（来自当前脚本）</div>
                {topRecurringIssues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {topRecurringIssues.map((row) => (
                      <div key={row.text} className="flex items-start justify-between gap-3">
                        <div className="text-sm text-gray-800">{row.text}</div>
                        <span className="shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-gray-50 text-gray-700 border-gray-200">
                          {row.n} 次
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                    {sections.pitfalls ||
                      sections.frequentMistakes ||
                      '暂无。建议把你常犯的错误写在「常见错误」里形成 checklist。'}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">最近改进情况</div>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                  {sections.reviewNotes || '建议：每次练完写 3 行复盘（改了什么 / 哪更好了 / 下次怎么做）。'}
                </div>
              </div>
            </div>
          </div>
        )}

        {editorTab === 'inspirations' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">灵感本</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  长期收集开头/转场/镜头/字幕文案等灵感，后续一键加入分镜或转成脚本草稿。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={inspQuery}
                  onChange={(e) => setInspQuery(e.target.value)}
                  placeholder="搜索标题/描述/标签…"
                  className="px-3 py-2 text-xs border border-gray-200 rounded-lg"
                />
                <button
                  onClick={() => {
                    setInspCreateOpen(true)
                    setInspTitle('')
                    setInspType('镜头')
                    setInspDesc('')
                    setInspSourceUrl('')
                    setInspRefImage('')
                    setInspTags('')
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
                >
                  + 新增灵感
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 space-y-2">
                {(() => {
                  const q = inspQuery.trim().toLowerCase()
                  const list = q
                    ? inspirations.filter((x) => {
                        const hay = `${x.title}\n${x.description}\n${(x.tags || []).join(' ')}`.toLowerCase()
                        return hay.includes(q)
                      })
                    : inspirations
                  if (list.length === 0) {
                    return <div className="text-xs text-gray-500">暂无灵感。点击右上角「新增灵感」开始记录。</div>
                  }
                  return list
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((x) => (
                      <div key={x.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{x.title}</div>
                            <div className="mt-1 text-[11px] text-gray-500">
                              {x.type} · {new Date(x.createdAt).toLocaleString('zh-CN')}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const ok = window.confirm('确认删除这条灵感吗？')
                              if (!ok) return
                              persistInspirations(inspirations.filter((it) => it.id !== x.id))
                            }}
                            className="text-[11px] text-red-500 hover:text-red-700"
                          >
                            删除
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-gray-700 whitespace-pre-wrap line-clamp-4">{x.description}</div>
                        {(x.tags || []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {x.tags.slice(0, 6).map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            disabled={!selectedId}
                            onClick={() => {
                              if (!selectedId) return
                              const contentText = `${x.title}\n${x.description}`.trim()
                              setQuickStoryboardOpen(false)
                              persistStoryboard((prev) =>
                                normalizeStoryboard([
                                  ...prev,
                                  {
                                    id: `sb_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`,
                                    order: prev.length + 1,
                                    shotNo: String(prev.length + 1),
                                    frameImage: x.referenceImage || '',
                                    shotType: x.type === '转场' ? '中景' : '',
                                    durationSec: 0,
                                    content: contentText,
                                    note: x.sourceUrl ? `来源：${x.sourceUrl}` : '',
                                  },
                                ]),
                              )
                              setEditorTab('breakdowns')
                              setMessage({ type: 'success', text: '已加入当前脚本分镜执行表' })
                            }}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                          >
                            加入当前分镜
                          </button>
                          <button
                            disabled={!selectedId}
                            onClick={() => {
                              if (!selectedId) return
                              const next = inspirations.map((it) =>
                                it.id === x.id ? { ...it, linkedScriptId: selectedId } : it,
                              )
                              persistInspirations(next)
                              setMessage({ type: 'success', text: '已关联到当前脚本' })
                            }}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                          >
                            关联当前脚本
                          </button>
                          <button
                            onClick={async () => {
                              // 轻量：用灵感标题创建一条新脚本，再进入拆解页
                              try {
                                const res = await fetch('/api/scripts', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    title: x.title,
                                    platform: 'TikTok',
                                    productSku: '',
                                    sourceUrl: x.sourceUrl || '',
                                  }),
                                })
                                const data = await res.json()
                                if (!res.ok) throw new Error(data.error || '创建失败')
                                const createdId = String(data.script?.id || data.id || '')
                                if (!createdId) throw new Error('创建失败')
                                setSelectedId(createdId)
                                setEditorTab('breakdowns')
                                // 详情/协同拆解会在 effect 中加载；这里补一份“我的拆解”草稿并预填镜头拆解
                                await startMyAnalysis(createdId)
                                setSections((prev) => ({
                                  ...prev,
                                  shots: prev.shots?.trim()
                                    ? prev.shots
                                    : `【灵感来源】${x.title}\n${x.description}`.trim(),
                                }))
                                setMessage({ type: 'success', text: '已转成脚本草稿（可继续拆解）' })
                              } catch (e: any) {
                                setMessage({ type: 'error', text: e?.message || '转成脚本失败' })
                              }
                            }}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100"
                          >
                            转成脚本草稿
                          </button>
                        </div>
                      </div>
                    ))
                })()}
              </div>

              <div className="lg:col-span-7">
                <div className="rounded-lg border border-gray-100 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">使用说明</div>
                  <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                    {`- “快速记分镜”：快速搭一整套分镜骨架（多行草稿），一键写入当前脚本的分镜执行表。\n- “灵感本”：长期收集碎片化创意（开头/转场/镜头/字幕文案/卖点表达），后续一键插入当前分镜或转成脚本草稿。\n- “分镜执行表”：正式执行版镜头表，后续继续补画面参考、时长、景别、转场说明等细节。`}
                  </div>
                </div>
              </div>
            </div>

            {inspCreateOpen && (
              <div className="fixed inset-0 z-50">
                <div className="absolute inset-0 bg-black/30" onClick={() => setInspCreateOpen(false)} />
                <div className="absolute inset-0 flex items-start justify-center p-4 overflow-y-auto">
                  <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border border-gray-200 max-h-[85vh] flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">新增灵感</div>
                      <button
                        type="button"
                        onClick={() => setInspCreateOpen(false)}
                        className="text-xs text-gray-500 hover:text-gray-800"
                      >
                        关闭
                      </button>
                    </div>
                    <div className="p-4 space-y-3 overflow-y-auto flex-1">
                      <div>
                        <div className="text-xs font-medium text-gray-900">标题</div>
                        <input
                          value={inspTitle}
                          onChange={(e) => setInspTitle(e.target.value)}
                          className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                          placeholder="一句话总结灵感"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-medium text-gray-900">类型</div>
                          <select
                            value={inspType}
                            onChange={(e) => setInspType(e.target.value as InspirationType)}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                          >
                            <option value="开头">开头</option>
                            <option value="转场">转场</option>
                            <option value="镜头">镜头</option>
                            <option value="字幕文案">字幕文案</option>
                            <option value="卖点表达">卖点表达</option>
                          </select>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-900">标签（逗号分隔）</div>
                          <input
                            value={inspTags}
                            onChange={(e) => setInspTags(e.target.value)}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                            placeholder="例如：结果先给, 反差, 假发"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-900">简短描述</div>
                        <textarea
                          value={inspDesc}
                          onChange={(e) => setInspDesc(e.target.value)}
                          rows={4}
                          className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg whitespace-pre-wrap"
                          placeholder="写下镜头/字幕/转场的关键细节…"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-medium text-gray-900">来源链接（可选）</div>
                          <input
                            value={inspSourceUrl}
                            onChange={(e) => setInspSourceUrl(e.target.value)}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                            placeholder="https://…"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-900">参考图（可选）</div>
                          <input
                            value={inspRefImage}
                            onChange={(e) => setInspRefImage(e.target.value)}
                            className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                            placeholder="图片链接（或后续再补）"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0 bg-white">
                      <button
                        onClick={() => setInspCreateOpen(false)}
                        className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          const title = inspTitle.trim()
                          if (!title) {
                            setMessage({ type: 'error', text: '请填写标题' })
                            return
                          }
                          const item: InspirationItem = {
                            id: `insp_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`,
                            title,
                            type: inspType,
                            description: inspDesc.trim(),
                            sourceUrl: inspSourceUrl.trim(),
                            referenceImage: inspRefImage.trim(),
                            tags: inspTags
                              .split(/[,，]/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .slice(0, 12),
                            createdAt: new Date().toISOString(),
                          }
                          persistInspirations([item, ...inspirations])
                          setInspCreateOpen(false)
                          setMessage({ type: 'success', text: '已保存到灵感本' })
                        }}
                        className="px-3 py-2 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 左侧：脚本列表 */}
      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">爆款脚本拆解训练台</h1>
            <p className="mt-1 text-sm text-gray-600">
              运营更新拆解，剪辑师按区块学习、执行与复盘。
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              新建脚本
            </button>
          )}
        </div>

        {message.text && (
          <div
            className={`p-3 rounded-lg text-xs ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {createOpen && canEdit && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="脚本标题（必填）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={createPlatform}
                onChange={(e) => setCreatePlatform(e.target.value)}
                placeholder="平台（如 TikTok）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                value={createSku}
                onChange={(e) => setCreateSku(e.target.value)}
                placeholder="关联 SKU（可选）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <input
              value={createSourceUrl}
              onChange={(e) => setCreateSourceUrl(e.target.value)}
              placeholder="来源链接（可选）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={saving || !createTitle.trim()}
                className="px-3 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建'}
              </button>
              <button
                onClick={() => setCreateOpen(false)}
                className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / SKU / 平台..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {isInitializingScripts && scripts.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">加载中...</div>
          ) : scripts.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">暂无脚本</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {scripts.map((s) => {
                const latest = s.breakdowns?.[0]
                const sec =
                  detail && detail.id === s.id
                    ? sections
                    : emptySections
                const learningStatus = inferLearningStatus(sec)
                const updatedByName = latest?.editedBy?.name || latest?.editedBy?.email || '-'
                const updatedByRole = roleLabel(latest?.editedBy?.role)
                const groupHint = s.productSku ? '假发组' : '通用组'

                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedId === s.id ? 'bg-primary-50 border-l-2 border-primary-500' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-gray-900 truncate text-sm">
                          {s.title}
                        </div>
                        <span className="text-[11px] text-gray-400 shrink-0">
                          {latest
                            ? new Date(latest.updatedAt).toLocaleString('zh-CN')
                            : new Date(s.updatedAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200">
                          {s.platform || '-'}
                        </span>
                        <span>SKU: {s.productSku || '-'}</span>
                        <span className="text-gray-300">|</span>
                        <span>
                          更新：{updatedByName}（{updatedByRole}）
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {['开头', '节奏', '转场', '字幕', '卖点表达'].map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-600 border border-gray-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500">{groupHint}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${
                              learningStatus === '已掌握'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : learningStatus === '学习中'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : learningStatus === '需复盘'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {learningStatusLabel(learningStatus || '待学习')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 中间：拆解详情主区域 */}
      <div className="lg:col-span-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-full flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex flex-col gap-4">
              <div className="border-b pb-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  剪辑训练首页 · 今日安排
                </h2>
                <p className="mt-1 text-xs text-gray-600">
                  左侧选择具体脚本后可进入详细拆解，这里先给出今日学习建议和复盘方向。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/60">
                  <div className="text-xs font-semibold text-blue-900 mb-1.5">
                    今日推荐学习
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-blue-900 space-y-1">
                    <li>优先看「前 3 秒拆解」和「节奏拆解」区块，明确钩子和整体节奏。</li>
                    <li>对照本周主要爆款，找出 1–2 条节奏最顺的脚本进行复盘。</li>
                    <li>尝试在自己的剪辑中复用至少一个新的镜头节奏或转场方式。</li>
                  </ul>
                </div>

                <div className="border border-purple-100 rounded-lg p-3 bg-purple-50/60">
                  <div className="text-xs font-semibold text-purple-900 mb-1.5">
                    最近更新的拆解方法
                  </div>
                  <p className="text-[11px] text-purple-900 leading-relaxed">
                    近期新增了对「字幕行距与节奏对齐」「卖点表达三步走」等方法的拆解。建议剪辑师在新项目前先快速浏览相关区块。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-red-100 rounded-lg p-3 bg-red-50/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-red-900">
                      常见错误 TOP 3
                    </span>
                    <span className="text-[11px] text-red-500">先规避，再优化</span>
                  </div>
                  <ol className="list-decimal list-inside text-[11px] text-red-900 space-y-1">
                    <li>开头 3 秒信息量不足，痛点不够明确。</li>
                    <li>字幕节奏与画面、口播不同步，阅读负担过重。</li>
                    <li>镜头变化少，导致中段节奏拖沓、完播率低。</li>
                  </ol>
                </div>

                <div className="border border-green-100 rounded-lg p-3 bg-green-50/70">
                  <div className="text-xs font-semibold text-green-900 mb-1.5">
                    本周优秀案例（示意）
                  </div>
                  <p className="text-[11px] text-green-900">
                    从最近数据中筛选出的高表现视频，会在左侧列表中被提前置顶。建议剪辑师优先拆解这些案例，重点看：
                    开头钩子、镜头节奏、卖点表达和收尾 Call to Action。
                  </p>
                </div>
              </div>

              <div className="mt-2 border-t pt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const first = scripts[0]
                    if (first) setSelectedId(first.id)
                  }}
                  className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  disabled={scripts.length === 0}
                >
                  去学习首个推荐脚本
                </button>
                <button
                  onClick={() => {
                    if (scripts.length > 0) {
                      const latest = [...scripts].sort(
                        (a, b) =>
                          new Date(b.updatedAt).getTime() -
                          new Date(a.updatedAt).getTime(),
                      )[0]
                      setSelectedId(latest.id)
                    }
                  }}
                  className="px-3 py-2 text-xs bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  disabled={scripts.length === 0}
                >
                  查看最新更新
                </button>
                <button
                  onClick={ensureTasksFromTopScripts}
                  className="px-3 py-2 text-xs bg-white text-gray-800 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  disabled={scripts.length === 0 || !userId}
                >
                  生成我的今日任务
                </button>
                <button
                  onClick={() => {
                    const needReview = scripts[0]
                    if (needReview) setSelectedId(needReview.id)
                  }}
                  className="px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
                  disabled={scripts.length === 0}
                >
                  开始本周复盘
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-900">我的今日任务</div>
                    <div className="text-[11px] text-gray-500">{todayTasks.length} 条</div>
                  </div>
                  <div className="space-y-2">
                    {todayTasks.slice(0, 6).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (t.script?.id) setSelectedId(t.script.id)
                        }}
                        className="w-full text-left rounded-lg border border-gray-100 hover:bg-gray-50 p-2"
                      >
                        <div className="text-xs font-medium text-gray-900 truncate">{t.title}</div>
                        {t.focus && <div className="mt-1 text-[11px] text-gray-600">重点：{t.focus}</div>}
                        {t.requirement && (
                          <div className="mt-0.5 text-[11px] text-gray-600">练习：{t.requirement}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500">
                          <span>状态：{t.status}</span>
                          {t.dueAt && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>截止：{new Date(t.dueAt).toLocaleString('zh-CN')}</span>
                            </>
                          )}
                          {t.owner && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>
                                负责人：{t.owner.name || t.owner.email}（{roleLabel(t.owner.role)})
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                    {todayTasks.length === 0 && (
                      <div className="text-[11px] text-gray-500">
                        今天还没有任务。你可以点上面的“生成我的今日任务”，或让负责人给你指派。
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-900">今日更新动态</div>
                    <div className="text-[11px] text-gray-500">{todayLogs.length} 条</div>
                  </div>
                  <div className="space-y-2">
                    {todayLogs.slice(0, 8).map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedId(u.script.id)}
                        className="w-full text-left rounded-lg border border-gray-100 hover:bg-gray-50 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-gray-900 truncate">{u.script.title}</div>
                          <div className="text-[11px] text-gray-400 shrink-0">
                            {new Date(u.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-gray-700">{u.summary}</div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-gray-500">
                          <span>
                            更新人：{u.createdByNameSnapshot || '-'}（{roleLabel(u.createdByRoleSnapshot || undefined)}）
                          </span>
                          {(u.impactScope || u.impactArea) && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>
                                影响：{u.impactScope || '-'} {u.impactArea ? `· ${u.impactArea}` : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                    {todayLogs.length === 0 && (
                      <div className="text-[11px] text-gray-500">今天还没有更新动态。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="text-center py-12 text-gray-500 text-sm">加载中...</div>
          ) : !detail ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              脚本不存在或你无权访问
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{detail.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600">
                    <span>平台：{detail.platform || '-'}</span>
                    <span>SKU：{detail.productSku || '-'}</span>
                    {detail.sourceUrl ? (
                      <a
                        className="text-primary-600 hover:underline"
                        href={detail.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        来源链接
                      </a>
                    ) : (
                      <span>来源链接：-</span>
                    )}
                    <span>
                      最新版本：v{latestMeta?.version || 1} · 更新时间：
                      {latestMeta
                        ? new Date(latestMeta.updatedAt).toLocaleString('zh-CN')
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {canEdit && (
                  <div className="relative">
                    <button
                      onClick={() => setMoreOpen((v) => !v)}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      更多操作
                    </button>
                    {moreOpen && (
                      <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg text-xs z-20">
                        <button
                          onClick={async () => {
                            setMoreOpen(false)
                            const nextTitle =
                              window.prompt('重命名脚本：', detail.title || '')?.trim() || ''
                            if (!nextTitle || nextTitle === detail.title) return
                            try {
                              const res = await fetch(`/api/scripts/${detail.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title: nextTitle }),
                              })
                              const data = await res.json()
                              if (res.ok) {
                                setDetail((prev) => (prev ? { ...prev, title: nextTitle } : prev))
                                await fetchList()
                                setMessage({ type: 'success', text: '已重命名脚本' })
                              } else {
                                setMessage({ type: 'error', text: data.error || '重命名失败' })
                              }
                            } catch {
                              setMessage({ type: 'error', text: '重命名失败' })
                            }
                          }}
                          className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                        >
                          重命名脚本
                        </button>
                        <button
                          onClick={async () => {
                            setMoreOpen(false)
                            const confirmCopy = window.confirm('复制当前脚本及拆解内容？')
                            if (!confirmCopy) return
                            const content = buildContentFromSections(sections)
                            try {
                              const res = await fetch('/api/scripts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  title: `${detail.title}（副本）`,
                                  platform: detail.platform,
                                  productSku: detail.productSku,
                                  sourceUrl: detail.sourceUrl,
                                  content,
                                }),
                              })
                              const data = await res.json()
                              if (res.ok && data.script?.id) {
                                await fetchList()
                                setSelectedId(data.script.id)
                                setMessage({ type: 'success', text: '已复制脚本' })
                              } else {
                                setMessage({ type: 'error', text: data.error || '复制失败' })
                              }
                            } catch {
                              setMessage({ type: 'error', text: '复制失败' })
                            }
                          }}
                          className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                        >
                          复制脚本
                        </button>
                        <button
                          onClick={async () => {
                            setMoreOpen(false)
                            const ok = window.confirm('确认将该脚本归档？归档后默认不在主列表显示。')
                            if (!ok) return
                            try {
                              const res = await fetch(`/api/scripts/${detail.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'archived' }),
                              })
                              const data = await res.json()
                              if (res.ok) {
                                setMessage({ type: 'success', text: '已归档脚本' })
                                setSelectedId('')
                                setDetail(null)
                                await fetchList()
                              } else {
                                setMessage({ type: 'error', text: data.error || '归档失败' })
                              }
                            } catch {
                              setMessage({ type: 'error', text: '归档失败' })
                            }
                          }}
                          className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                        >
                          归档脚本
                        </button>
                        <div className="border-t border-gray-200" />
                        <button
                          onClick={async () => {
                            setMoreOpen(false)
                            const first = window.confirm('删除脚本会移除该脚本及所有拆解，确认继续？')
                            if (!first) return
                            const second = window.confirm(`再次确认删除《${detail.title}》？此操作不可恢复。`)
                            if (!second) return
                            try {
                              const res = await fetch(`/api/scripts/${detail.id}`, {
                                method: 'DELETE',
                              })
                              const data = await res.json()
                              if (res.ok) {
                                setMessage({ type: 'success', text: '已删除脚本' })
                                setSelectedId('')
                                setDetail(null)
                                await fetchList()
                              } else {
                                setMessage({ type: 'error', text: data.error || '删除失败' })
                              }
                            } catch {
                              setMessage({ type: 'error', text: '删除失败' })
                            }
                          }}
                          className="block w-full px-3 py-1.5 text-left hover:bg-red-50 text-red-600"
                        >
                          删除脚本
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                  <button
                    onClick={() => fetchDetail(detail.id)}
                    className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={!(canEdit || isEditor) || saving}
                    className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : canEdit ? '保存当前版本' : '提交学习状态与练习链接'}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={!canEdit || saving}
                    className="px-3 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    title="生成新版本，保留历史拆解"
                  >
                    保存为新版本
                  </button>
                </div>
              </div>

              {/* 更新信息（让剪辑一眼看出：谁改的、改了什么） */}
              {(() => {
                const latestLog = detail.updateLogs?.[0]
                const updaterName =
                  latestLog?.createdByNameSnapshot ||
                  latestMeta?.editedBy?.name ||
                  latestMeta?.editedBy?.email ||
                  '-'
                const updaterRole = roleLabel(
                  (latestLog?.createdByRoleSnapshot || latestMeta?.editedBy?.role) as any,
                )
                const updatedAt = latestLog?.createdAt || latestMeta?.updatedAt
                const summary = latestLog?.summary || '—'

                return (
                  <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-gray-700">
                      <span className="font-medium text-gray-800">更新信息</span>
                      <span className="text-gray-300">|</span>
                      <span>最新版本：v{latestMeta?.version || 1}</span>
                      <span className="text-gray-300">|</span>
                      <span>
                        更新人：{updaterName}（{updaterRole}）
                      </span>
                      <span className="text-gray-300">|</span>
                      <span>更新时间：{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-600">本次更新摘要：{summary}</div>
                  </div>
                )
              })()}

              {/* 今日任务状态（把“今天做什么、做完交给谁”钉在详情里） */}
              {(() => {
                const task = todayTasks.find((t) => t.script?.id === detail.id)
                const ownerText = task?.owner
                  ? `${task.owner.name || task.owner.email}（${roleLabel(task.owner.role)}）`
                  : '-'
                return (
                  <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-800">我的今日任务</span>
                      <span className="text-gray-600">
                        {task ? task.title : '未创建（建议先点“创建今日任务 / 生成我的今日任务”）'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                      <span>状态：{task ? task.status : '-'}</span>
                      <span className="text-gray-300">|</span>
                      <span>截止：{task?.dueAt ? new Date(task.dueAt).toLocaleString('zh-CN') : '-'}</span>
                      <span className="text-gray-300">|</span>
                      <span>负责人：{ownerText}</span>
                    </div>
                  </div>
                )
              })()}

              {!canEdit && !isEditor && (
                <div className="mb-3 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-xs">
                  当前账号为只读权限，不可编辑拆解内容。
                </div>
              )}
              {isEditor && (
                <div className="mb-3 p-3 rounded-lg bg-blue-50 text-blue-700 text-xs">
                  你仅可：查看脚本、标记已学习、提交练习成片、查看负责人点评；不可删除脚本或修改系统数据。
                </div>
              )}
              {hasLocalChange && (
                <div className="mb-3 p-3 rounded-lg bg-blue-50 text-blue-700 text-xs">
                  你有未保存的改动。保存前系统不会用轮询结果覆盖你的编辑。
                </div>
              )}

              {/* 训练动作按钮 */}
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {canEdit && (
                <button
                  onClick={() => createTaskForScript(detail.id, detail.title, detail.productSku)}
                  disabled={!userId}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  创建今日任务
                </button>
                )}
                {!scriptsReadOnly && (
                <>
                <button
                  onClick={() => {
                    setSections((prev) => ({
                      ...prev,
                      learningStatus: '已掌握',
                    }))
                    const task = todayTasks.find((t) => t.script?.id === detail.id)
                    if (task) updateTask(task.id, { status: 'done' })
                  }}
                  disabled={!(canEdit || isEditor)}
                  className="px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-50"
                >
                  标记已学习
                </button>
                <button
                  onClick={() => {
                    if (!canEdit && !isEditor) return
                    setSections((prev) => ({
                      ...prev,
                      learningStatus: prev.learningStatus?.includes('学习中') ? prev.learningStatus : '学习中',
                    }))
                    const task = todayTasks.find((t) => t.script?.id === detail.id)
                    if (task) updateTask(task.id, { status: 'in_progress' })
                  }}
                  disabled={!(canEdit || isEditor)}
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  开始练习
                </button>
                <button
                  onClick={() => {
                    if (!canEdit && !isEditor) return
                    const url = window.prompt('粘贴练习成片链接：', sections.practiceUrl || '')
                    if (url != null) {
                      setSections((prev) => ({ ...prev, practiceUrl: url }))
                    }
                    const task = todayTasks.find((t) => t.script?.id === detail.id)
                    if (task) updateTask(task.id, { status: 'submitted' })
                  }}
                  disabled={!(canEdit || isEditor)}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                >
                  提交练习成片
                </button>
                </>
                )}
                <button
                  onClick={() => {
                    const el = document.getElementById('lead-comment-card')
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
                >
                  查看负责人点评
                </button>
                {canEdit && (
                <>
                <button
                  onClick={() => {
                    const note = window.prompt('补充一条复盘记录：')
                    if (note && note.trim()) {
                      const prefix = sections.reviewNotes ? sections.reviewNotes + '\n' : ''
                      const line = `${new Date().toLocaleDateString('zh-CN')}: ${note.trim()}`
                      setSections((prev) => ({
                        ...prev,
                        reviewNotes: prefix + line,
                      }))
                    }
                    const task = todayTasks.find((t) => t.script?.id === detail.id)
                    if (task) updateTask(task.id, { status: 'review' })
                  }}
                  className="px-3 py-1.5 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
                >
                  加入复盘记录
                </button>
                <button
                  onClick={() => {
                    const task = todayTasks.find((t) => t.script?.id === detail.id)
                    if (!task) return
                    const next = window.prompt(
                      '设置截止时间（例如：2026-03-13 18:00）',
                      task.dueAt ? new Date(task.dueAt).toLocaleString('zh-CN') : '',
                    )
                    if (!next) return
                    const d = new Date(next)
                    if (Number.isNaN(d.getTime())) {
                      setMessage({ type: 'error', text: '截止时间格式不正确' })
                      return
                    }
                    updateTask(task.id, { dueAt: d.toISOString() })
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                >
                  调整截止
                </button>
                </>
                )}
              </div>

              <div className="space-y-3 overflow-y-auto">
                {[
                  {
                    label: '视频定位',
                    key: 'positioning',
                    placeholder: '目标人群、使用场景、主打卖点…',
                  },
                  {
                    label: '前 3 秒拆解',
                    key: 'hook3s',
                    placeholder: '开头 3 秒画面+文案+动作，钩子逻辑…',
                  },
                  {
                    label: '节奏拆解',
                    key: 'rhythm',
                    placeholder: '整体节奏：段落划分、剪辑节奏、情绪起伏…',
                  },
                  {
                    label: '镜头拆解',
                    key: 'shots',
                    placeholder: '镜头 1 / 2 / 3… 每个镜头的构图、运动方式…',
                  },
                  {
                    label: '字幕 / 文案拆解',
                    key: 'subtitles',
                    placeholder: '口播、字幕、重点词强调、排版方式…',
                  },
                  {
                    label: '音效 / BGM / 转场建议',
                    key: 'audio',
                    placeholder: 'BGM 类型、节奏点、转场方式、音效使用…',
                  },
                  {
                    label: '这条内容的核心学习点',
                    key: 'learnings',
                    placeholder: '1. …\n2. …\n3. …',
                  },
                  {
                    label: '今日执行要求',
                    key: 'todayExecution',
                    placeholder:
                      '今天要做什么（动作导向）：\n- 先做：…\n- 交付：…（成片/链接/备注）\n- 标准：…（节奏/字幕/镜头）\n- 截止：…（时间）',
                  },
                  {
                    label: '常见错误提醒',
                    key: 'pitfalls',
                    placeholder: '剪辑师在仿拍时最容易犯的 3–5 个错误…',
                  },
                ].map((block) => (
                  <div
                    key={block.key}
                    className="border border-gray-100 rounded-lg p-3 bg-gray-50/70"
                  >
                    <div className="text-xs font-medium text-gray-700 mb-1.5">
                      {block.label}
                    </div>
                    <textarea
                      value={(sections as any)[block.key] as string}
                      onChange={(e) =>
                        setSections((prev) => ({
                          ...prev,
                          [block.key]: e.target.value,
                        }))
                      }
                      disabled={!canEdit}
                      placeholder={block.placeholder}
                      className="w-full min-h-[72px] px-2 py-1.5 border border-gray-200 rounded text-xs font-mono focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                ))}

                <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/50">
                  <div className="text-xs font-semibold text-blue-800 mb-2">
                    训练闭环（学习状态 / 练习成片 / 复盘）
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="text-[11px] text-gray-600">学习状态</div>
                      <select
                        value={sections.learningStatus}
                        onChange={(e) =>
                          setSections((prev) => ({
                            ...prev,
                            learningStatus: e.target.value,
                          }))
                        }
                        disabled={!(canEdit || isEditor)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      >
                        <option value="">未标记</option>
                        <option value="待学习">待学习</option>
                        <option value="学习中">学习中</option>
                        <option value="已掌握">已掌握</option>
                        <option value="需复盘">需复盘</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-gray-600">练习成片链接</div>
                      <input
                        value={sections.practiceUrl}
                        onChange={(e) =>
                          setSections((prev) => ({
                            ...prev,
                            practiceUrl: e.target.value,
                          }))
                        }
                        disabled={!(canEdit || isEditor)}
                        placeholder="贴上剪辑练习的视频链接"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-1">
                      <div className="text-[11px] text-gray-600">复盘记录</div>
                      <textarea
                        value={sections.reviewNotes}
                        onChange={(e) =>
                          setSections((prev) => ({
                            ...prev,
                            reviewNotes: e.target.value,
                          }))
                        }
                        disabled={!canEdit}
                        placeholder="本条脚本的整体复盘：哪里做好 / 哪里需改进…"
                        className="w-full min-h-[60px] px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-gray-50 text-xs font-medium text-gray-700">
                    版本记录（最近 {detail.breakdowns.length} 条）
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] text-gray-500">
                          版本
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] text-gray-500">
                          更新时间
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] text-gray-500">
                          编辑者
                        </th>
                        <th className="px-3 py-2 text-left text-[11px] text-gray-500">
                          更新摘要
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {detail.breakdowns.map((b) => (
                        <tr key={b.id}>
                          <td className="px-3 py-1.5 text-xs">v{b.version}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">
                            {new Date(b.updatedAt).toLocaleString('zh-CN')}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">
                            {b.editedBy?.name || b.editedBy?.email || '-'}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-600">
                            {(detail.updateLogs || []).find((l) => l.breakdownVersion === b.version)?.summary || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 右侧：训练看板（展示为主，避免表单感） */}
      <div className="lg:col-span-3 space-y-4">
        {/* 今日训练重点 */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-blue-900">今日训练重点</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-[11px] text-blue-800">
              团队同步
            </span>
          </div>
          <div className="text-[11px] text-blue-900 leading-relaxed">
            {sections.todayFocus?.trim()
              ? sections.todayFocus
                  .split('\n')
                  .filter((line) => line.trim())
                  .slice(0, 5)
                  .map((line, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 mb-1.5">
                      <span className="mt-[3px] h-[6px] w-[6px] rounded-full bg-blue-500" />
                      <span className="flex-1">{line.replace(/^[-•\d\.\s]+/, '')}</span>
                    </div>
                  ))
              : (
                <div className="text-blue-500/70">
                  暂无今日重点。可先按中间“核心学习点/常见错误提醒”执行。
                </div>
              )}
          </div>
        </div>

        {/* 负责人点评 */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm" id="lead-comment-card">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-800">负责人点评</div>
            {latestMeta && (
              <span className="text-[11px] text-gray-400">
                {new Date(latestMeta.updatedAt).toLocaleString('zh-CN')}
              </span>
            )}
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-6 w-6 rounded-full bg-primary-100 flex items-center justify-center text-[10px] text-primary-700">
              评
            </div>
            <div className="flex-1 text-[11px] text-gray-700 leading-relaxed">
              {sections.leadComment?.trim()
                ? sections.leadComment
                : '还没有集中点评。建议负责人补充“对齐标准 + 关键改进点”。'}
            </div>
          </div>
        </div>

        {/* 最近高频错误 */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-red-900">最近高频错误</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-[11px] text-red-800">
              重点规避
            </span>
          </div>
          {sections.frequentMistakes?.trim() ? (
            <ul className="space-y-1.5 text-[11px] text-red-900 list-disc list-inside">
              {sections.frequentMistakes
                .split('\n')
                .filter((line) => line.trim())
                .slice(0, 6)
                .map((line, idx) => (
                  <li key={idx}>{line.replace(/^[-•\d\.\s]+/, '')}</li>
                ))}
            </ul>
          ) : (
            <div className="text-[11px] text-red-500/80">暂无记录。</div>
          )}
        </div>

        {/* 最近表现好的方法 */}
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-green-900">最近表现好的方法</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-[11px] text-green-800">
              值得复用
            </span>
          </div>
          {sections.goodPatterns?.trim() ? (
            <div className="space-y-1.5 text-[11px] text-green-900">
              {sections.goodPatterns
                .split('\n')
                .filter((line) => line.trim())
                .slice(0, 5)
                .map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-1.5 bg-white/60 border border-green-100 rounded px-2 py-1"
                  >
                    <span className="mt-[2px] text-[10px] text-green-700">✓</span>
                    <span className="flex-1">{line.replace(/^[-•\d\.\s]+/, '')}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-[11px] text-green-600/80">暂无沉淀。</div>
          )}
        </div>

        {/* 今日更新动态 */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-800">今日更新动态</div>
            <span className="text-[11px] text-gray-400">共 {todayLogs.length} 条</span>
          </div>
          <div className="space-y-2">
            {todayLogs.slice(0, 6).map((u) => (
              <button
                key={`${u.id}-side`}
                onClick={() => setSelectedId(u.script.id)}
                className="w-full text-left rounded-lg border border-gray-100 hover:bg-gray-50 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-gray-900 truncate">{u.script.title}</div>
                  <div className="text-[11px] text-gray-400 shrink-0">
                    {new Date(u.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-gray-700">{u.summary}</div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {u.createdByNameSnapshot || '-'}（{roleLabel(u.createdByRoleSnapshot || undefined)}）
                </div>
              </button>
            ))}
            {todayLogs.length === 0 && <div className="text-[11px] text-gray-500">今天暂无更新。</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

