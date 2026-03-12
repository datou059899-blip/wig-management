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

const canEditRole = (role?: string) => role === 'admin' || role === 'operator' || role === 'editor'

export default function ScriptsPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = canEditRole(role)

  const [search, setSearch] = useState('')
  const [scripts, setScripts] = useState<ScriptListItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<ScriptDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' })

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
          // 避免覆盖用户正在编辑的内容：仅当内容没被改动时才自动刷新
          const hasLocalChange = content !== lastSavedRef.current
          if (!hasLocalChange) {
            setContent(latest.content || '')
            lastSavedRef.current = latest.content || ''
          }
        } else {
          setContent('')
          lastSavedRef.current = ''
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
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch(`/api/scripts/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, createNewVersion }),
      })
      const data = await res.json()
      if (res.ok) {
        lastSavedRef.current = content
        setMessage({ type: 'success', text: createNewVersion ? '已保存为新版本' : '已保存' })
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
      {/* 左侧列表 */}
      <div className="lg:col-span-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">爆款脚本拆解</h1>
            <p className="text-gray-600 text-sm">剪辑师可实时更新拆解内容</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              新建
            </button>
          )}
        </div>

        {message.text && (
          <div className={`mb-4 p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {message.text}
          </div>
        )}

        {createOpen && canEdit && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
            <div className="space-y-3">
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="脚本标题（必填）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={createPlatform}
                  onChange={(e) => setCreatePlatform(e.target.value)}
                  placeholder="平台（例如 TikTok）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  value={createSku}
                  onChange={(e) => setCreateSku(e.target.value)}
                  placeholder="关联 SKU（可选）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <input
                value={createSourceUrl}
                onChange={(e) => setCreateSourceUrl(e.target.value)}
                placeholder="来源链接（可选）"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={saving || !createTitle.trim()}
                  className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? '创建中...' : '创建'}
                </button>
                <button
                  onClick={() => setCreateOpen(false)}
                  className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / SKU / 平台..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loadingList ? (
            <div className="text-center py-10 text-gray-500">加载中...</div>
          ) : scripts.length === 0 ? (
            <div className="text-center py-10 text-gray-500">暂无脚本</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {scripts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selectedId === s.id ? 'bg-primary-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-gray-900 truncate">{s.title}</div>
                    <div className="text-xs text-gray-500 shrink-0">
                      {new Date(s.updatedAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 flex gap-2">
                    <span>{s.platform || '-'}</span>
                    {s.productSku ? <span>SKU: {s.productSku}</span> : <span>SKU: -</span>}
                    <span>v{(s.breakdowns?.[0]?.version || 1) as any}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧编辑器 */}
      <div className="lg:col-span-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {!selectedId ? (
            <div className="text-center py-12 text-gray-500">请选择左侧脚本</div>
          ) : loadingDetail ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : !detail ? (
            <div className="text-center py-12 text-gray-500">脚本不存在或无权限</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{detail.title}</h2>
                  <div className="mt-1 text-sm text-gray-600 flex flex-wrap gap-3">
                    <span>平台：{detail.platform || '-'}</span>
                    <span>SKU：{detail.productSku || '-'}</span>
                    {detail.sourceUrl ? (
                      <a className="text-primary-600 hover:underline" href={detail.sourceUrl} target="_blank" rel="noreferrer">
                        来源链接
                      </a>
                    ) : (
                      <span>来源链接：-</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    最新版本：v{latestMeta?.version || 1} · 更新时间：{latestMeta ? new Date(latestMeta.updatedAt).toLocaleString('zh-CN') : '-'}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => fetchDetail(detail.id)}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={!canEdit || saving}
                    className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={!canEdit || saving}
                    className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="生成新版本，保留历史"
                  >
                    新版本
                  </button>
                </div>
              </div>

              {!canEdit && (
                <div className="mb-3 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
                  你当前是只读权限（需要 admin/operator/editor 才能编辑）。
                </div>
              )}
              {hasLocalChange && (
                <div className="mb-3 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
                  你有未保存的改动。系统不会自动覆盖你的编辑内容。
                </div>
              )}

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!canEdit}
                placeholder="在这里写爆款脚本拆解（支持 Markdown）：\n\n- 1s 钩子：...\n- 人设/场景：...\n- 痛点：...\n- 解决方案：...\n- 卖点：...\n- 口播/字幕：...\n- 镜头拆分：...\n- Call to Action：..."
                className="w-full min-h-[420px] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              />

              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">历史版本（最近 20 条）</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">版本</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">更新时间</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">编辑者</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {detail.breakdowns.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-2 text-sm">v{b.version}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {new Date(b.updatedAt).toLocaleString('zh-CN')}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
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
    </div>
  )
}

