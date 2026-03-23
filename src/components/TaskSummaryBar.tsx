'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { isLead } from '@/lib/permissions'

type WorkTask = {
  id: string
  title: string
  sourceModule: string
  taskType: string
  priority: string
  assignee: string
  dueDate: string
  status: string
  note?: string | null
  completedAt?: string | null
}

const moduleIcons: Record<string, string> = {
  '产品': '📦',
  '达人建联': '🤝',
  '脚本拆解': '✂️',
  '经营数据': '📈',
}

const priorityColors: Record<string, string> = {
  '高': 'text-red-600 bg-red-50',
  '中': 'text-amber-600 bg-amber-50',
  '低': 'text-gray-600 bg-gray-50',
}

interface TaskSummaryBarProps {
  filterModule?: string
  limit?: number
  showCompletionFeed?: boolean
  compact?: boolean
}

export function TaskSummaryBar({ filterModule, limit = 5, showCompletionFeed: initialShowFeed = false, compact = false }: TaskSummaryBarProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canManage = ['admin', 'lead', 'product_operator', 'operator', 'influencer_operator'].includes(role || '')
  const isLeadRole = isLead(role)

  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [completedToday, setCompletedToday] = useState<WorkTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showFeed, setShowFeed] = useState(initialShowFeed)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [showNoteInput, setShowNoteInput] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/work-tasks?mine=1')
      const data = await res.json()
      if (res.ok) {
        const allTasks = (data.tasks || []) as WorkTask[]
        let filtered = allTasks.filter(t => t.status !== '已完成')
        
        if (filterModule) {
          filtered = filtered.filter(t => t.sourceModule === filterModule)
        }
        
        setTasks(filtered)
        
        const today = new Date().toDateString()
        const completed = allTasks.filter(t => 
          t.status === '已完成' && 
          t.completedAt && 
          new Date(t.completedAt).toDateString() === today
        )
        setCompletedToday(completed)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [filterModule])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  const completeTask = async (task: WorkTask, note?: string) => {
    setCompletingId(task.id)
    try {
      const noteToSave = note || task.note || undefined
      const res = await fetch(`/api/work-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: '已完成',
          completedAt: new Date().toISOString(),
          note: noteToSave,
        }),
      })
      if (res.ok) {
        setToast({ type: 'success', text: '任务已完成 ✓' })
        setShowNoteInput(null)
        setNoteText('')
        await fetchTasks()
      } else {
        setToast({ type: 'error', text: '完成失败，请重试' })
      }
    } catch {
      setToast({ type: 'error', text: '完成失败，请重试' })
    } finally {
      setCompletingId(null)
    }
  }

  const today = new Date()
  const primaryTasks = tasks.filter(t => t.priority === '高')
  const secondaryTasks = tasks.filter(t => t.priority !== '高')
  const overdueTasks = tasks.filter(t => t.status === '已延期' || new Date(t.dueDate) < today)
  const displayTasks = tasks.slice(0, limit)

  const formatTime = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}小时前`
    return d.toLocaleDateString('zh-CN')
  }

  if (loading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (tasks.length === 0 && completedToday.length === 0) {
    return null
  }

  return (
    <div className="card overflow-hidden">
      {toast && (
        <div className={`px-4 py-2 rounded-lg shadow-lg text-sm ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.text}
          <button onClick={() => setToast(null)} className="ml-2 text-xs opacity-70">×</button>
        </div>
      )}

      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-base">📋</div>
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {filterModule ? `${moduleIcons[filterModule]} ${filterModule}相关` : '今日任务'}
              </div>
              {!compact && (
                <div className="text-xs text-gray-500 mt-0.5">
                  共 {tasks.length} 项待处理
                </div>
              )}
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-4 text-xs">
            {primaryTasks.length > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{primaryTasks.length}</div>
                <div className="text-gray-500">首要</div>
              </div>
            )}
            {secondaryTasks.length > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{secondaryTasks.length}</div>
                <div className="text-gray-500">次要</div>
              </div>
            )}
            {overdueTasks.length > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-amber-600">{overdueTasks.length}</div>
                <div className="text-gray-500">延期</div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isLeadRole && completedToday.length > 0 && (
              <button
                onClick={() => setShowFeed(!showFeed)}
                className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {showFeed ? '收起动态' : `今日完成(${completedToday.length})`}
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard/workbench')}
              className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              全部任务
            </button>
            {canManage && (
              <button
                onClick={() => router.push('/dashboard/workbench?create=1')}
                className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                + 新建
              </button>
            )}
          </div>
        </div>
      </div>

      {!compact && tasks.length > 0 && (
        <div className="divide-y divide-gray-100">
          {displayTasks.map((task) => (
            <div key={task.id} className="px-4 py-3 hover:bg-gray-50/50 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{moduleIcons[task.sourceModule] || '📋'}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">{task.title}</span>
                    <span className={`badge text-[10px] ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                    {task.status === '已延期' && (
                      <span className="badge text-[10px] bg-red-50 text-red-600">已延期</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{task.assignee}</span>
                    <span>·</span>
                    <span>{new Date(task.dueDate).toLocaleDateString('zh-CN')}</span>
                    {task.note && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[150px]">{task.note}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 shrink-0">
                  {showNoteInput === task.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="备注(可选)"
                        className="w-24 px-2 py-1 text-xs border border-gray-200 rounded"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') completeTask(task, noteText)
                          if (e.key === 'Escape') {
                            setShowNoteInput(null)
                            setNoteText('')
                          }
                        }}
                      />
                      <button
                        onClick={() => completeTask(task, noteText)}
                        disabled={completingId === task.id}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => { setShowNoteInput(null); setNoteText('') }}
                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNoteInput(task.id)}
                      disabled={completingId === task.id}
                      className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {completingId === task.id ? '完成中...' : <><span>✓</span> 完成</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {tasks.length > limit && (
            <div className="px-4 py-2 text-center">
              <button onClick={() => router.push('/dashboard/workbench')} className="text-xs text-blue-600 hover:text-blue-800">
                查看更多任务 ({tasks.length - limit} 项)
              </button>
            </div>
          )}
        </div>
      )}

      {compact && tasks.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {displayTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => completeTask(task)}
              disabled={completingId === task.id}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition text-xs shrink-0 disabled:opacity-50"
            >
              <span>{moduleIcons[task.sourceModule] || '📋'}</span>
              <span className="text-gray-700 truncate max-w-[100px]">{task.title}</span>
              <span className="text-green-600">{completingId === task.id ? '...' : '✓'}</span>
            </button>
          ))}
          {tasks.length > limit && (
            <button onClick={() => router.push('/dashboard/workbench')} className="text-xs text-blue-600 hover:text-blue-800 shrink-0">
              +{tasks.length - limit} 更多
            </button>
          )}
        </div>
      )}

      {showFeed && completedToday.length > 0 && (
        <div className="border-t border-gray-100 bg-green-50/50">
          <div className="px-4 py-2 border-b border-green-100">
            <div className="text-xs font-medium text-green-700">✓ 今日已完成</div>
          </div>
          <div className="divide-y divide-green-100 max-h-48 overflow-y-auto">
            {completedToday.map((task) => (
              <div key={task.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-600">✓</span>
                  <span className="font-medium text-gray-900">{task.assignee}</span>
                  <span className="text-gray-500">完成了</span>
                  <span className="text-gray-700">{task.title}</span>
                  <span className="text-gray-400 ml-auto">{formatTime(task.completedAt)}</span>
                </div>
                {task.note && (
                  <div className="mt-1 text-xs text-gray-500 pl-5">
                    💬 {task.note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
