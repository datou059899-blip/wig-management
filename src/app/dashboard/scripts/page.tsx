 'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

type ScriptListItem = {
  id: string
  title: string
  platform?: string | null
  productSku?: string | null
  sourceUrl?: string | null
  status: string
  updatedAt: string
  breakdowns?: { id: string; version: number; updatedAt: string }[]
}

type ScriptDetail = Omit<ScriptListItem, 'breakdowns'> & {
  breakdowns: {
    id: string
    version: number
    content: string
    updatedAt: string
    editedBy?: { id: string; email: string; name?: string | null } | null
  }[]
}

const canEditRole = (role?: string) =>
  role === 'admin' || role === 'operator' || role === 'editor'

type BreakdownSections = {
  positioning: string
  hook3s: string
  rhythm: string
  shots: string
  subtitles: string
  audio: string
  learnings: string
  pitfalls: string
  todayFocus: string
  leadComment: string
  frequentMistakes: string
  goodPatterns: string
  learningStatus: string
  practiceUrl: string
  reviewNotes: string
}

const emptySections: BreakdownSections = {
  positioning: '',
  hook3s: '',
  rhythm: '',
  shots: '',
  subtitles: '',
  audio: '',
  learnings: '',
  pitfalls: '',
  todayFocus: '',
  leadComment: '',
  frequentMistakes: '',
  goodPatterns: '',
  learningStatus: '',
  practiceUrl: '',
  reviewNotes: '',
}

const sectionOrder: { key: keyof BreakdownSections; title: string }[] = [
  { key: 'positioning', title: '视频定位' },
  { key: 'hook3s', title: '前3秒拆解' },
  { key: 'rhythm', title: '节奏拆解' },
  { key: 'shots', title: '镜头拆解' },
  { key: 'subtitles', title: '字幕/文案拆解' },
  { key: 'audio', title: '音效 / BGM / 转场建议' },
  { key: 'learnings', title: '核心学习点' },
  { key: 'pitfalls', title: '常见错误提醒' },
  { key: 'todayFocus', title: '今日新增要求' },
  { key: 'leadComment', title: '负责人点评' },
  { key: 'frequentMistakes', title: '最近高频错误' },
  { key: 'goodPatterns', title: '最近表现好的方法' },
  { key: 'learningStatus', title: '学习状态' },
  { key: 'practiceUrl', title: '练习成片链接' },
  { key: 'reviewNotes', title: '复盘记录' },
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

export default function ScriptsPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = canEditRole(role)

  const [search, setSearch] = useState('')
  const [scripts, setScripts] = useState<ScriptListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<ScriptDetail | null>(null)
  const [sections, setSections] = useState<BreakdownSections>(emptySections)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createPlatform, setCreatePlatform] = useState('TikTok')
  const [createSku, setCreateSku] = useState('')
  const [createSourceUrl, setCreateSourceUrl] = useState('')

  const [content, setContent] = useState('')
  const lastSavedRef = useRef<string>('')

  const pollMs = 4000

  const listQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    params.set('status', 'active')
    return params.toString()
  }, [search])

  const fetchList = async () => {
    setLoadingList(true)
    try {
      const res = await fetch(`/api/scripts?${listQuery}`)
      const data = await res.json()
      if (res.ok) {
        const next = (data.scripts || []).map((s: any) => ({
          ...s,
          updatedAt: String(s.updatedAt),
        }))
        setScripts(next)
        if (!selectedId && next.length > 0) setSelectedId(next[0].id)
      }
    } finally {
      setLoadingList(false)
    }
  }

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
            setSections(parseContentToSections(raw))
          }
        } else {
          setContent('')
          lastSavedRef.current = ''
          setSections({ ...emptySections })
        }
      }
    } finally {
      if (!silent) setLoadingDetail(false)
    }
  }

  useEffect(() => {
    fetchList()
    const t = setInterval(() => fetchList(), pollMs)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery])

  useEffect(() => {
    if (!selectedId) return
    fetchDetail(selectedId)
    const t = setInterval(() => fetchDetail(selectedId, true), pollMs)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const handleSave = async (createNewVersion: boolean) => {
    if (!detail) return
    const nextContent = buildContentFromSections(sections)
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch(`/api/scripts/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: nextContent, createNewVersion }),
      })
      const data = await res.json()
      if (res.ok) {
        setContent(nextContent)
        lastSavedRef.current = nextContent
        setMessage({
          type: 'success',
          text: createNewVersion ? '已保存为新版本' : '已保存',
        })
        await fetchDetail(detail.id, true)
        await fetchList()
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
        await fetchList()
        const id = data.script?.id
        if (id) setSelectedId(id)
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
  const hasLocalChange = content !== lastSavedRef.current

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
          {loadingList ? (
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

                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedId === s.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-gray-900 truncate">{s.title}</div>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {latest
                          ? new Date(latest.updatedAt).toLocaleString('zh-CN')
                          : new Date(s.updatedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span>{s.platform || '-'}</span>
                      <span>SKU: {s.productSku || '-'}</span>
                      <span>v{(latest?.version || 1) as any}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] ${
                          learningStatus === '已掌握'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : learningStatus === '学习中'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : learningStatus === '需复盘'
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {learningStatus || '待学习'}
                      </span>
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
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchDetail(detail.id)}
                    className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={!canEdit || saving}
                    className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '保存当前版本'}
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

              {!canEdit && (
                <div className="mb-3 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-xs">
                  当前账号为只读权限（admin / operator / editor 才能编辑拆解）。
                </div>
              )}
              {hasLocalChange && (
                <div className="mb-3 p-3 rounded-lg bg-blue-50 text-blue-700 text-xs">
                  你有未保存的改动。保存前系统不会用轮询结果覆盖你的编辑。
                </div>
              )}

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
                        disabled={!canEdit}
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
                        disabled={!canEdit}
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
                    历史版本（最近 {detail.breakdowns.length} 条）
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

      {/* 右侧：实时更新与反馈区 */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-xs font-semibold text-gray-800 mb-2">
            今日训练重点（同步给剪辑师）
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <div className="text-[11px] text-gray-500 mb-1">今日新增要求</div>
              <textarea
                value={sections.todayFocus}
                onChange={(e) =>
                  setSections((prev) => ({ ...prev, todayFocus: e.target.value }))
                }
                disabled={!canEdit}
                placeholder="例如：本周主练“前 3 秒钩子”和“卖点表达”，请优先看这条脚本的对应区块…"
                className="w-full min-h-[60px] px-2 py-1 border border-gray-200 rounded text-xs"
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">负责人点评</div>
              <textarea
                value={sections.leadComment}
                onChange={(e) =>
                  setSections((prev) => ({ ...prev, leadComment: e.target.value }))
                }
                disabled={!canEdit}
                placeholder="对最近剪辑产出的整体点评，与这条拆解的关系（示例：谁已经用好这个节奏、谁还需要注意…）"
                className="w-full min-h-[60px] px-2 py-1 border border-gray-200 rounded text-xs"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-800">
            团队最近表现一览
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">最近高频错误</div>
            <textarea
              value={sections.frequentMistakes}
              onChange={(e) =>
                setSections((prev) => ({
                  ...prev,
                  frequentMistakes: e.target.value,
                }))
              }
              disabled={!canEdit}
              placeholder="例如：钩子没有对准痛点；字幕节奏跟不上；镜头变化太少…"
              className="w-full min-h-[60px] px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">最近表现好的方法</div>
            <textarea
              value={sections.goodPatterns}
              onChange={(e) =>
                setSections((prev) => ({
                  ...prev,
                  goodPatterns: e.target.value,
                }))
              }
              disabled={!canEdit}
              placeholder="把团队最近做得好的做法沉淀出来，比如：哪条视频的节奏特别好、哪种转场方式效果好…"
              className="w-full min-h-[60px] px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

