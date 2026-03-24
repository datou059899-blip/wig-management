'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { EmptyStatePresets } from '@/components/EmptyState'
import { isLead } from '@/lib/permissions'

type WorkTask = {
  id: string
  taskKey: string
  title: string
  sourceModule: string
  taskType: 'assigned' | 'system' | 'self'
  priority: string
  // 使用 userId
  assigneeUserId: string
  creatorUserId?: string | null
  ownerUserId?: string | null
  // 用户名快照（用于显示）
  assigneeName?: string | null
  creatorName?: string | null
  ownerName?: string | null
  dueDate: string
  remindAt?: string | null
  status: string
  relatedEntityId: string
  note?: string | null
  delayDays?: number | null
  isTodayMustDo?: boolean | null
  isPrimary?: boolean | null
  // 完成要求（新字段名）
  requireCompletionNote?: boolean | null
  requireCompletionLink?: boolean | null
  requireCompletionResult?: boolean | null
  // 完成内容
  completedNote?: string | null
  completedLink?: string | null
  completedResult?: string | null
  completedAt?: string | null
  createdAt?: string | null
}

const toLocalDateKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const isSameLocalDay = (a: Date, b: Date) => toLocalDateKey(a) === toLocalDateKey(b)

const statusOrder = (s: string) => {
  if (s === '已延期') return 4
  if (s === '已完成') return 3
  if (s === '进行中') return 2
  if (s === '待做') return 1
  return 9
}

const priorityOrder = (p: string) => {
  if (p === '高') return 1
  if (p === '中') return 2
  if (p === '低') return 3
  return 4
}

const moduleIcons: Record<string, string> = {
  '产品': '📦',
  '达人建联': '🤝',
  '脚本拆解': '✂️',
  '经营数据': '📈',
  '自定义': '📝',
}

const taskTypeLabels: Record<string, string> = {
  'assigned': '负责人分配',
  'system': '系统生成',
  'self': '自建任务',
}

const taskTypeColors: Record<string, string> = {
  'assigned': 'badge-primary',
  'system': 'badge-success',
  'self': 'badge-purple',
}

const SOURCE_MODULE_OPTIONS = [
  { value: '产品', label: '产品列表' },
  { value: '达人建联', label: '达人建联' },
  { value: '脚本拆解', label: '脚本拆解' },
  { value: '经营数据', label: '经营数据' },
  { value: '选品更新池', label: '选品更新池' },
  { value: '自定义', label: '自定义' },
]

export default function WorkbenchPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const currentUserId = (session?.user as any)?.id || ''
  const currentUserName = (session?.user as any)?.name || (session?.user as any)?.email || ''
  
  // 负责人权限（包括总负责人）
  const canManage = ['admin', 'lead', 'product_operator', 'operator', 'influencer_operator'].includes(role || '')
  // 总负责人视角
  const isLeadRole = isLead(role)
  // 团队任务视角（总负责人可以看到所有人任务）
  const [teamView, setTeamView] = useState(false)

  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [allTasks, setAllTasks] = useState<WorkTask[]>([])
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{id: string, name: string, email: string, role: string}[]>([])

  const dayKey = useMemo(() => toLocalDateKey(new Date()), [])
  const now = new Date()

  const fetchTasks = async () => {
    try {
      setLoading(true)
      // 如果是团队视角，获取所有任务
      const endpoint = teamView ? '/api/work-tasks' : '/api/work-tasks?mine=1'
      const res = await fetch(endpoint)
      const data = await res.json()
      if (res.ok) {
        const taskList = (data.tasks || []) as WorkTask[]
        setTasks(taskList)
        if (teamView) {
          setAllTasks(taskList)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  // 获取所有用户（用于任务分配）
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users/list')
      const data = await res.json()
      if (res.ok) {
        setUsers((data.users || []).map((u: any) => ({
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: u.role,
        })))
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        setSyncing(true)
        await fetch('/api/work-tasks/sync', { method: 'POST' })
      } finally {
        setSyncing(false)
        await fetchTasks()
        await fetchUsers()
      }
    })()
    const t = setInterval(() => fetchTasks(), 30000)
    return () => clearInterval(t)
  }, [teamView])

  // 根据当前视图获取任务列表
  const currentTasks = teamView && isLeadRole ? allTasks : tasks

  const categorized = useMemo(() => {
    const active = currentTasks.filter((t) => t.status !== '已完成')
    
    // 使用日期字符串比较，而不是时间戳比较
    // 只有截止日期早于今天的任务才算是逾期，今天截止的不算逾期
    const todayStr = toLocalDateKey(now)
    const delayed = active.filter((t) => {
      if (t.status === '已延期') return true
      const dueDateStr = toLocalDateKey(new Date(t.dueDate))
      return dueDateStr < todayStr
    })
    const today = active.filter((t) => {
      const dueDateStr = toLocalDateKey(new Date(t.dueDate))
      return dueDateStr === todayStr && t.status !== '已延期'
    })
    
    // 今日首要任务（isTodayMustDo 或 高优先级 + 负责人分配）
    const primary = today.filter((t) => t.isTodayMustDo === true || (t.priority === '高' && t.taskType === 'assigned'))
    // 今日次要任务
    const secondary = today.filter((t) => !primary.includes(t))
    // 我的自建任务（或团队自建任务）
    const mySelfTasks = active.filter((t) => t.taskType === 'self' && (teamView ? true : t.assigneeUserId === currentUserId))
    // 延续/逾期任务
    const delayedTasks = delayed.filter((t) => !today.includes(t))
    
    // 已完成任务（最近 5 条）
    const completed = currentTasks
      .filter((t) => t.status === '已完成')
      .sort((a, b) => new Date(b.completedAt || b.dueDate).getTime() - new Date(a.completedAt || a.dueDate).getTime())
      .slice(0, 5)

    const sortList = (arr: WorkTask[]) =>
      arr
        .slice()
        .sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || priorityOrder(a.priority) - priorityOrder(b.priority) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

    return {
      primary: sortList(primary),
      secondary: sortList(secondary),
      mySelfTasks: sortList(mySelfTasks),
      delayed: sortList(delayedTasks),
      completed,
    }
  }, [currentTasks, now, currentUserId, teamView])

  const jumpToTask = (t: WorkTask) => {
    const id = encodeURIComponent(t.relatedEntityId)
    if (t.sourceModule === '产品') {
      router.push(`/dashboard/products?productId=${id}`)
      return
    }
    if (t.sourceModule === '达人建联') {
      router.push(`/dashboard/influencers?influencerId=${id}`)
      return
    }
    if (t.sourceModule === '脚本拆解') {
      router.push(`/dashboard/scripts?scriptId=${id}`)
      return
    }
    router.push(`/dashboard/influencers?influencerId=${id}`)
  }

  const updateTaskStatus = async (id: string, nextStatus: string) => {
    console.log('[updateTaskStatus] 开始更新任务状态')
    console.log('[updateTaskStatus] 任务 ID:', id)
    console.log('[updateTaskStatus] 目标状态:', nextStatus)
    try {
      const res = await fetch(`/api/work-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: nextStatus,
          // 完成任务时传递空值（让后端验证）
          completedNote: nextStatus === '已完成' ? '' : undefined,
          completedLink: nextStatus === '已完成' ? '' : undefined,
          completedResult: nextStatus === '已完成' ? '' : undefined,
        }),
      })
      console.log('[updateTaskStatus] 响应状态:', res.status)
      const data = await res.json()
      console.log('[updateTaskStatus] 响应数据:', JSON.stringify(data, null, 2))
      if (res.ok) {
        await fetchTasks()
      } else {
        alert(data.error || '更新失败')
      }
    } catch (e) {
      console.error('[updateTaskStatus] 异常:', e)
      alert('更新失败：' + (e as Error).message)
    }
  }

  const updateTask = async (id: string, updates: Partial<WorkTask>) => {
    try {
      const res = await fetch(`/api/work-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) await fetchTasks()
    } catch {
      // ignore
    }
  }

  // 新建任务弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [createForOther, setCreateForOther] = useState(false)
  const [form, setForm] = useState({
    title: '',
    sourceModule: '产品',
    taskType: 'self' as 'assigned' | 'system' | 'self',
    priority: '中',
    assigneeUserId: currentUserId,
    ownerUserId: '',
    dueDate: dayKey,
    remindAt: '',
    isTodayMustDo: false,
    relatedEntityId: '',
    note: '',
    // 完成要求
    requireCompletionNote: false,
    requireCompletionLink: false,
    requireCompletionResult: false,
  })

  const submitCreate = async () => {
    console.log('[submitCreate] ===== 开始执行 =====')
    console.log('[submitCreate] 当前 form:', JSON.stringify(form, null, 2))
    console.log('[submitCreate] currentUserId:', currentUserId)
    console.log('[submitCreate] form.title:', form.title)
    console.log('[submitCreate] form.title.trim():', form.title.trim())
    console.log('[submitCreate] form.assigneeUserId:', form.assigneeUserId)
    
    try {
      // 验证必填字段
      if (!form.title.trim()) {
        console.log('[submitCreate] 验证失败：标题为空')
        alert('请填写任务标题')
        return
      }
      if (!form.assigneeUserId) {
        console.log('[submitCreate] 验证失败：执行人为空')
        alert('请选择执行人')
        return
      }

      console.log('[submitCreate] 验证通过，准备发送请求')

      const due = form.dueDate ? new Date(`${form.dueDate}T18:00:00`) : new Date()
      due.setHours(18, 0, 0, 0)
      
      const remindAt = form.remindAt ? new Date(`${form.remindAt}:00`) : null
      
      const payload = {
        title: form.title.trim(),
        sourceModule: form.sourceModule,
        priority: form.priority,
        assigneeUserId: form.assigneeUserId,
        ownerUserId: form.ownerUserId || null,
        dueDate: due.toISOString(),
        remindAt: remindAt ? remindAt.toISOString() : null,
        isTodayMustDo: form.isTodayMustDo,
        status: '待做',
        note: form.note || null,
        relatedEntityId: form.relatedEntityId || '-',
        requireCompletionNote: form.requireCompletionNote,
        requireCompletionLink: form.requireCompletionLink,
        requireCompletionResult: form.requireCompletionResult,
      }

      console.log('[submitCreate] 请求 payload:', JSON.stringify(payload, null, 2))
      console.log('[submitCreate] 开始 fetch POST /api/work-tasks')
      
      const res = await fetch('/api/work-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      console.log('[submitCreate] fetch 返回，status:', res.status)
      
      const data = await res.json()
      console.log('[submitCreate] 响应数据:', JSON.stringify(data, null, 2))
      
      if (res.ok) {
        console.log('[submitCreate] 创建成功，关闭弹窗并刷新')
        // 先关闭弹窗和重置表单
        setCreateOpen(false)
        setForm({
          title: '',
          sourceModule: '产品',
          taskType: 'self',
          priority: '中',
          assigneeUserId: currentUserId,
          ownerUserId: '',
          dueDate: dayKey,
          remindAt: '',
          isTodayMustDo: false,
          relatedEntityId: '',
          note: '',
          requireCompletionNote: false,
          requireCompletionLink: false,
          requireCompletionResult: false,
        })
        // 立即刷新任务列表，确保页面立即显示新任务
        await fetchTasks()
        console.log('[submitCreate] 刷新完成')
      } else {
        console.log('[submitCreate] 创建失败:', data.error)
        alert(data.error || '创建失败')
      }
    } catch (e) {
      console.error('[submitCreate] 异常:', e)
      alert('创建失败：' + (e as Error).message)
    }
  }

  // 编辑任务弹窗
  const [editingTask, setEditingTask] = useState<WorkTask | null>(null)
  const [editForm, setEditForm] = useState({
    priority: '',
    dueDate: '',
    note: '',
    isTodayMustDo: false,
    assigneeUserId: '',
    ownerUserId: '',
    remindAt: '',
    requireCompletionNote: false,
    requireCompletionLink: false,
    requireCompletionResult: false,
  })

  const openEdit = (task: WorkTask) => {
    setEditingTask(task)
    setEditForm({
      priority: task.priority,
      dueDate: task.dueDate.split('T')[0],
      note: task.note || '',
      isTodayMustDo: task.isTodayMustDo || false,
      assigneeUserId: task.assigneeUserId,
      ownerUserId: task.ownerUserId || '',
      remindAt: task.remindAt ? task.remindAt.slice(0, 16) : '',
      requireCompletionNote: task.requireCompletionNote || false,
      requireCompletionLink: task.requireCompletionLink || false,
      requireCompletionResult: task.requireCompletionResult || false,
    })
  }

  const submitEdit = async () => {
    if (!editingTask) return
    const updates: Partial<WorkTask> = {
      priority: editForm.priority,
      dueDate: new Date(editForm.dueDate + 'T18:00:00').toISOString(),
      note: editForm.note || null,
      isTodayMustDo: editForm.isTodayMustDo,
      assigneeUserId: editForm.assigneeUserId,
      ownerUserId: editForm.ownerUserId || null,
      remindAt: editForm.remindAt ? new Date(editForm.remindAt + ':00').toISOString() : null,
      requireCompletionNote: editForm.requireCompletionNote,
      requireCompletionLink: editForm.requireCompletionLink,
      requireCompletionResult: editForm.requireCompletionResult,
    }
    await updateTask(editingTask.id, updates)
    setEditingTask(null)
  }

  const hasAnyTask = categorized.primary.length > 0 || categorized.secondary.length > 0 || categorized.mySelfTasks.length > 0 || categorized.delayed.length > 0

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {teamView && isLeadRole ? '团队任务概览' : '今日工作台'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {teamView && isLeadRole 
              ? '查看全员任务进度，管理排期与优先级' 
              : '清晰了解今日任务优先级，延续昨日未完成事项'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 总负责人切换团队视图 */}
          {isLeadRole && (
            <button
              type="button"
              onClick={() => setTeamView(!teamView)}
              className={`btn ${teamView ? 'btn-primary' : 'btn-secondary'}`}
            >
              {teamView ? '👁️ 我的任务' : '👥 团队任务'}
            </button>
          )}
          <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
            + 新建任务
          </button>
        </div>
      </div>

      {/* 同步状态 */}
      {syncing && (
        <div className="text-xs text-green-600 bg-green-50 rounded-lg border border-green-100 p-3 flex items-center gap-2">
          <span className="animate-pulse">●</span> 正在同步任务数据…
        </div>
      )}

      {/* 无任务空状态 */}
      {!loading && !hasAnyTask && (
        <div className="card p-8">
          {EmptyStatePresets.noTasks(
            <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
              创建任务
            </button>
          )}
        </div>
      )}

      {/* 有任务时显示内容 */}
      {hasAnyTask && (
        <>
          {/* 任务概览统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 border-l-4 border-l-green-500">
              <div className="text-xs text-gray-500">今日首要</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{categorized.primary.length}</div>
            </div>
            <div className="card p-4 border-l-4 border-l-blue-400">
              <div className="text-xs text-gray-500">今日次要</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{categorized.secondary.length}</div>
            </div>
            <div className="card p-4 border-l-4 border-l-purple-400">
              <div className="text-xs text-gray-500">{teamView && isLeadRole ? '全部自建' : '我的自建'}</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{categorized.mySelfTasks.length}</div>
            </div>
            <div className="card p-4 border-l-4 border-l-red-500">
              <div className="text-xs text-gray-500">逾期/延期</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{categorized.delayed.length}</div>
            </div>
          </div>

          {/* 团队视角：按人分组展示 */}
          {teamView && isLeadRole && users.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">按负责人查看</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {users.map((user) => {
                  const userTasks = currentTasks.filter(t => t.assigneeUserId === user.id && t.status !== '已完成')
                  const completedCount = currentTasks.filter(t => t.assigneeUserId === user.id && t.status === '已完成').length
                  const totalCount = userTasks.length + completedCount
                  return (
                    <div key={user.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                      <div className="font-medium text-gray-900 text-sm">{user.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        进行中：{userTasks.length} / 已完成：{completedCount}
                      </div>
                      {totalCount > 0 && (
                        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full" 
                            style={{ width: `${(completedCount / totalCount) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 任务列表 4 列 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 首要任务 */}
            <section className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> 今日首要
                </div>
                <span className="text-xs text-gray-400">{categorized.primary.length} 项</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {categorized.primary.length === 0 ? (
                  <div className="text-xs text-gray-400 py-4 text-center">暂无首要任务</div>
                ) : (
                  categorized.primary.map((t) => (
                    <TaskCard key={t.id} task={t} onUpdate={updateTaskStatus} onEdit={openEdit} canManage={canManage} showAssignee={teamView} />
                  ))
                )}
              </div>
            </section>

            {/* 次要任务 */}
            <section className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span> 今日次要
                </div>
                <span className="text-xs text-gray-400">{categorized.secondary.length} 项</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {categorized.secondary.length === 0 ? (
                  <div className="text-xs text-gray-400 py-4 text-center">暂无次要任务</div>
                ) : (
                  categorized.secondary.map((t) => (
                    <TaskCard key={t.id} task={t} onUpdate={updateTaskStatus} onEdit={openEdit} canManage={canManage} showAssignee={teamView} />
                  ))
                )}
              </div>
            </section>

            {/* 自建任务 */}
            <section className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span> 自建任务
                </div>
                <span className="text-xs text-gray-400">{categorized.mySelfTasks.length} 项</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {categorized.mySelfTasks.length === 0 ? (
                  <div className="text-xs text-gray-400 py-4 text-center">暂无自建任务</div>
                ) : (
                  categorized.mySelfTasks.map((t) => (
                    <TaskCard key={t.id} task={t} onUpdate={updateTaskStatus} onEdit={openEdit} canManage={canManage} showAssignee={teamView} />
                  ))
                )}
              </div>
            </section>

            {/* 逾期/延期任务 */}
            <section className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> 逾期/延期
                </div>
                <span className="text-xs text-gray-400">{categorized.delayed.length} 项</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {categorized.delayed.length === 0 ? (
                  <div className="text-xs text-green-600 py-4 text-center flex items-center justify-center gap-1">
                    <span>✓</span> 暂无逾期任务
                  </div>
                ) : (
                  categorized.delayed.map((t) => (
                    <TaskCard key={t.id} task={t} onUpdate={updateTaskStatus} onEdit={openEdit} canManage={canManage} showAssignee={teamView} />
                  ))
                )}
              </div>
            </section>
          </div>

          {/* 最近完成任务 */}
          {categorized.completed.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="text-green-500">✓</span> 最近完成
              </div>
              <div className="space-y-2">
                {categorized.completed.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50/50 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{moduleIcons[t.sourceModule] || '📋'}</span>
                      <span className="text-gray-600 line-through">{t.title}</span>
                      <span className={`badge ${taskTypeColors[t.taskType]}`}>{taskTypeLabels[t.taskType]}</span>
                      {teamView && <span className="text-xs text-gray-400">@{t.assigneeName}</span>}
                    </div>
                    <span className="text-xs text-gray-400">
                      {t.completedAt ? new Date(t.completedAt).toLocaleString('zh-CN').slice(0, 16) : '已完成'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 轻提示区 */}
      <div className="card p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-100">
        <div className="flex items-start gap-3">
          <div className="text-xl">💡</div>
          <div>
            <div className="text-sm font-medium text-green-800">
              {isLeadRole ? '总负责人工作台' : '工作台说明'}
            </div>
            <div className="text-xs text-green-700 mt-1">
              {isLeadRole 
                ? '总负责人可以切换「团队任务」视图查看全员进度，分配任务给指定用户，设置优先级和今日必做。'
                : '任务分为三类：负责人分配（蓝色）、系统生成（绿色）、自建任务（紫色）。负责人可指派任务给其他用户。'}
            </div>
          </div>
        </div>
      </div>

      {/* 新建任务弹窗 */}
      {createOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setCreateOpen(false)} />
          <div className="modal-content max-w-2xl">
            <div className="modal-header">
              <div className="text-base font-semibold">新建任务</div>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">标题 *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input"
                  placeholder="任务标题"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">来源模块</label>
                  <select
                    value={form.sourceModule}
                    onChange={(e) => setForm({ ...form, sourceModule: e.target.value })}
                    className="input"
                  >
                    {SOURCE_MODULE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">优先级</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="input"
                  >
                    <option value="高">高</option>
                    <option value="中">中</option>
                    <option value="低">低</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">执行人 *</label>
                  <select
                    value={form.assigneeUserId}
                    onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}
                    className="input"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">负责人（可选）</label>
                  <select
                    value={form.ownerUserId}
                    onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
                    className="input"
                  >
                    <option value="">默认创建人</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">截止日期</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">提醒时间（可选）</label>
                  <input
                    type="datetime-local"
                    value={form.remindAt}
                    onChange={(e) => setForm({ ...form, remindAt: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isTodayMustDo}
                    onChange={(e) => setForm({ ...form, isTodayMustDo: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600">今日必做</span>
                </label>
              </div>

              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="补充说明..."
                />
              </div>

              {/* 完成要求 */}
              <div className="border-t pt-4">
                <div className="text-sm font-medium text-gray-700 mb-3">完成要求</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.requireCompletionNote}
                      onChange={(e) => setForm({ ...form, requireCompletionNote: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-600">完成后必须填写备注</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.requireCompletionLink}
                      onChange={(e) => setForm({ ...form, requireCompletionLink: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-600">完成后必须附链接</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.requireCompletionResult}
                      onChange={(e) => setForm({ ...form, requireCompletionResult: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-600">完成后必须填写结果说明</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateOpen(false)} className="btn-secondary">取消</button>
              <button onClick={() => void submitCreate()} disabled={!form.title.trim() || !form.assigneeUserId} className="btn-primary">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑任务弹窗 */}
      {editingTask && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setEditingTask(null)} />
          <div className="modal-content max-w-2xl">
            <div className="modal-header">
              <div className="text-base font-semibold">编辑任务</div>
              <div className="text-xs text-gray-500 mt-1">{editingTask.title}</div>
            </div>
            <div className="modal-body space-y-4">
              {/* 角色信息展示 */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">创建人</div>
                  <div className="font-medium">{editingTask.creatorName || '-'}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">负责人</div>
                  <div className="font-medium">{editingTask.ownerName || editingTask.creatorName || '-'}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">执行人</div>
                  <div className="font-medium">{editingTask.assigneeName || '-'}</div>
                </div>
              </div>

              {canManage && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-600 mb-1.5 block">执行人</label>
                      <select
                        value={editForm.assigneeUserId}
                        onChange={(e) => setEditForm({ ...editForm, assigneeUserId: e.target.value })}
                        className="input"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1.5 block">负责人</label>
                      <select
                        value={editForm.ownerUserId}
                        onChange={(e) => setEditForm({ ...editForm, ownerUserId: e.target.value })}
                        className="input"
                      >
                        <option value="">默认创建人</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-600 mb-1.5 block">优先级</label>
                      <select
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                        className="input"
                      >
                        <option value="高">高</option>
                        <option value="中">中</option>
                        <option value="低">低</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1.5 block">截止日期</label>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 mb-1.5 block">提醒时间</label>
                    <input
                      type="datetime-local"
                      value={editForm.remindAt}
                      onChange={(e) => setEditForm({ ...editForm, remindAt: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.isTodayMustDo}
                        onChange={(e) => setEditForm({ ...editForm, isTodayMustDo: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-600">今日必做</span>
                    </label>
                  </div>

                  {/* 完成要求 */}
                  <div className="border-t pt-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">完成要求</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.requireCompletionNote}
                          onChange={(e) => setEditForm({ ...editForm, requireCompletionNote: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">完成后必须填写备注</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.requireCompletionLink}
                          onChange={(e) => setEditForm({ ...editForm, requireCompletionLink: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">完成后必须附链接</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.requireCompletionResult}
                          onChange={(e) => setEditForm({ ...editForm, requireCompletionResult: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-600">完成后必须填写结果说明</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">备注</label>
                <textarea
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingTask(null)} className="btn-secondary">取消</button>
              <button onClick={() => void submitEdit()} className="btn-primary">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 任务卡片组件
function TaskCard({ task, onUpdate, onEdit, canManage, showAssignee }: { 
  task: WorkTask; 
  onUpdate: (id: string, status: string) => void;
  onEdit: (task: WorkTask) => void;
  canManage: boolean;
  showAssignee?: boolean;
}) {
  const priorityColors: Record<string, string> = {
    '高': 'text-red-600 bg-red-50',
    '中': 'text-amber-600 bg-amber-50',
    '低': 'text-gray-600 bg-gray-50',
  }

  return (
    <div className={`rounded-lg border p-3 hover:shadow-md transition-all cursor-pointer ${
      task.status === '已延期' ? 'border-red-100 bg-red-50/50' : 
      task.isTodayMustDo ? 'border-green-100 bg-green-50/50' :
      'border-gray-100 bg-white'
    }`} onClick={() => onEdit(task)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 leading-snug truncate">{task.title}</div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs">{moduleIcons[task.sourceModule] || '📋'}</span>
            <span className={`badge ${taskTypeColors[task.taskType]}`}>{taskTypeLabels[task.taskType]}</span>
            <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
          </div>
        </div>
      </div>
      
      <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
        <span>{showAssignee ? `@${task.assigneeName}` : (task.assigneeName || task.assigneeUserId)}</span>
        <span>{new Date(task.dueDate).toLocaleString('zh-CN').slice(0, 16)}</span>
      </div>
      
      {task.note && (
        <div className="mt-2 text-xs text-gray-600 line-clamp-2 bg-gray-50 rounded px-2 py-1">{task.note}</div>
      )}

      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {task.status === '待做' && (
          <button onClick={() => onUpdate(task.id, '进行中')} className="btn-secondary text-xs py-1 px-2">开始</button>
        )}
        {task.status !== '已完成' && (
          <button onClick={() => onUpdate(task.id, '已完成')} className="btn-primary text-xs py-1 px-2">完成</button>
        )}
      </div>
    </div>
  )
}