'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  canAssignWorkTask,
  canCreateOwnWorkTask,
  canManageTeamWorkTasks,
  canRunWorkTaskSync,
  canViewTeamWorkTasks,
} from '@/lib/permissions'
import { useToast } from '@/components/ToastProvider'

type WorkTask = {
  id: string
  taskKey: string
  title: string
  sourceModule: string
  taskType: 'assigned' | 'system' | 'self' | 'personal' | 'team'
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
  // 团队任务字段
  department?: string | null
  collaboratorUserIds?: string[] | null
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

type BusinessTodoStats = {
  inventoryRiskCount: number
  stockoutCount: number
  highRiskCount: number
  inventoryRiskItems: any[]
  overduePurchaseCount: number
  overduePurchaseItems: any[]
  businessMaintenanceCount: number
  missingCostCount: number
  missingPriceCount: number
  missingSupplierCount: number
  businessMaintenanceItems: any[]
  newProductPendingCount: number
  newProductUnfiledCount: number
  newProductInProgressCount: number
  newProductPendingItems: any[]
  businessStatusConflictCount: number
  businessStatusConflictItems: any[]
  upcomingArrivals: any[]
  upcomingTasks: WorkTask[]
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
  'personal': '个人任务',
  'team': '团队任务',
}

const taskTypeColors: Record<string, string> = {
  'assigned': 'badge-primary',
  'system': 'badge-success',
  'self': 'badge-purple',
  'personal': 'badge-blue',
  'team': 'badge-orange',
}

const SOURCE_MODULE_OPTIONS = [
  { value: '产品', label: '产品列表' },
  { value: '达人建联', label: '达人建联' },
  { value: '脚本拆解', label: '脚本拆解' },
  { value: '经营数据', label: '经营数据' },
  { value: '选品更新池', label: '选品更新池' },
  { value: '自定义', label: '自定义' },
]

const overduePurchaseStatuses = new Set([
  'ORDERED',
  'PRODUCING',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
])

const emptyBusinessTodoStats: BusinessTodoStats = {
  inventoryRiskCount: 0,
  stockoutCount: 0,
  highRiskCount: 0,
  inventoryRiskItems: [],
  overduePurchaseCount: 0,
  overduePurchaseItems: [],
  businessMaintenanceCount: 0,
  missingCostCount: 0,
  missingPriceCount: 0,
  missingSupplierCount: 0,
  businessMaintenanceItems: [],
  newProductPendingCount: 0,
  newProductUnfiledCount: 0,
  newProductInProgressCount: 0,
  newProductPendingItems: [],
  businessStatusConflictCount: 0,
  businessStatusConflictItems: [],
  upcomingArrivals: [],
  upcomingTasks: [],
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function isOverduePurchase(order: any) {
  if (!overduePurchaseStatuses.has(order?.status) || !order?.expectedArrivalDate) {
    return false
  }
  const expected = new Date(order.expectedArrivalDate)
  if (Number.isNaN(expected.getTime())) {
    return false
  }
  return startOfLocalDay(expected).getTime() < startOfLocalDay(new Date()).getTime()
}

function daysBetweenLocalDates(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / msPerDay)
}

function addLocalDays(date: Date, days: number) {
  const copy = startOfLocalDay(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function formatMonthDay(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getSupplierName(order: any) {
  return order?.supplier?.name || order?.supplierNameSnapshot || '未填写供应商'
}

function getPurchaseDevelopmentState(item: any) {
  if (item?.opportunity?.productId || item?.productId) return '已转正式商品'
  if (item?.opportunityExists) return item?.opportunity?.status ? `已建档 · ${item.opportunity.status}` : '已建档待继续'
  if (item?.linkStatus === 'DIFFERENT_CRAFT') return '同名不同工艺'
  if (item?.linkStatus === 'SKU_PENDING') return '待确认 SKU'
  return '未建档'
}

export default function WorkbenchPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const toast = useToast()
  const role = (session?.user as any)?.role as string | undefined
  const currentUserId = (session?.user as any)?.id || ''
  const currentUserName = (session?.user as any)?.name || (session?.user as any)?.email || ''
  
  const canCreateTask = canCreateOwnWorkTask(role)
  const canViewTeamTasks = canViewTeamWorkTasks(role)
  const canAssignTasks = canAssignWorkTask(role)
  const canManageTeamTasks = canManageTeamWorkTasks(role)
  const canSyncWorkTasks = canRunWorkTaskSync(role)
  // 团队任务视角（总负责人可以看到所有人任务）
  const [teamView, setTeamView] = useState(false)

  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [allTasks, setAllTasks] = useState<WorkTask[]>([])
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{id: string, name: string, email: string, role: string}[]>([])
  const [businessTodos, setBusinessTodos] = useState<BusinessTodoStats>(emptyBusinessTodoStats)
  const [showAllTasks, setShowAllTasks] = useState(false)

  const dayKey = useMemo(() => toLocalDateKey(new Date()), [])
  const now = new Date()

  const fetchTasks = async () => {
    try {
      setLoading(true)
      // 如果是团队视角，获取所有任务
      const endpoint = teamView && canViewTeamTasks ? '/api/work-tasks?mine=0' : '/api/work-tasks?mine=1'
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

  const fetchBusinessTodos = async () => {
    try {
      const [salesRes, businessRes, purchaseOrdersRes, opportunitiesRes, workTasksRes] = await Promise.all([
        fetch('/api/product-sales?range=7'),
        fetch('/api/inventory-purchasing/products/business'),
        fetch('/api/inventory-purchasing/purchase-orders'),
        fetch('/api/product-opportunities'),
        fetch('/api/work-tasks?mine=1'),
      ])

      const [sales, business, purchaseOrders, opportunities, workTasks] = await Promise.all([
        salesRes.ok ? salesRes.json() : Promise.resolve({ products: [] }),
        businessRes.ok ? businessRes.json() : Promise.resolve({ items: [] }),
        purchaseOrdersRes.ok ? purchaseOrdersRes.json() : Promise.resolve({ orders: [] }),
        opportunitiesRes.ok ? opportunitiesRes.json() : Promise.resolve({ purchaseDevelopmentItems: [] }),
        workTasksRes.ok ? workTasksRes.json() : Promise.resolve({ tasks: [] }),
      ])

      const salesProducts = sales.products || []
      const activeInventoryRisk = salesProducts.filter((product: any) =>
        product.businessStatus === 'ACTIVE' &&
        (product.inventoryRisk === '断货' || product.inventoryRisk === '高风险')
      ).sort((a: any, b: any) => {
        if (a.inventoryRisk === '断货' && b.inventoryRisk !== '断货') return -1
        if (a.inventoryRisk !== '断货' && b.inventoryRisk === '断货') return 1
        const aDays = a.currentSellableDays ?? Number.POSITIVE_INFINITY
        const bDays = b.currentSellableDays ?? Number.POSITIVE_INFINITY
        return aDays - bDays
      })
      const businessStatusConflicts = salesProducts.filter((product: any) =>
        ['OUT_OF_STOCK_DELISTED', 'DISCONTINUED'].includes(product.businessStatus) &&
        ((Number(product.weekSales) || 0) > 0 || (Number(product.monthSales) || 0) > 0)
      ).sort((a: any, b: any) => (Number(b.weekSales) || 0) - (Number(a.weekSales) || 0))

      const activeBusinessItems = (business.items || []).filter((item: any) => item.businessStatus === 'ACTIVE')
      const missingBusinessProductIds = new Set<string>()
      let missingCostCount = 0
      let missingPriceCount = 0
      let missingSupplierCount = 0
      const businessMaintenanceItems: any[] = []

      activeBusinessItems.forEach((item: any) => {
        const productKey = String(item.id || item.productId || item.sku)
        const missingFields: string[] = []
        if (!(Number(item.costCny) > 0)) {
          missingCostCount++
          missingBusinessProductIds.add(productKey)
          missingFields.push('缺成本')
        }
        if (item.currentSellingPriceUsd === null || item.currentSellingPriceUsd === undefined) {
          missingPriceCount++
          missingBusinessProductIds.add(productKey)
          missingFields.push('缺售价')
        }
        if (!item.defaultSupplier) {
          missingSupplierCount++
          missingBusinessProductIds.add(productKey)
          missingFields.push('缺 Supplier')
        }
        if (missingFields.length > 0) {
          businessMaintenanceItems.push({ ...item, missingFields })
        }
      })

      const purchaseDevelopmentItems = opportunities.purchaseDevelopmentItems || []
      const unfinishedDevelopmentItems = purchaseDevelopmentItems.filter((item: any) =>
        item.productId == null &&
        (!item.opportunityExists || item.opportunity?.status !== '已完成')
      )
      const today = startOfLocalDay(new Date())
      const sevenDaysLater = addLocalDays(today, 7)
      const purchaseOrdersList = purchaseOrders.orders || []
      const overduePurchaseItems = purchaseOrdersList
        .filter(isOverduePurchase)
        .map((order: any) => ({
          ...order,
          overdueDays: daysBetweenLocalDates(new Date(order.expectedArrivalDate), today),
        }))
        .sort((a: any, b: any) => b.overdueDays - a.overdueDays)
      const upcomingArrivals = purchaseOrdersList
        .filter((order: any) => {
          if (!overduePurchaseStatuses.has(order?.status) || !order?.expectedArrivalDate) return false
          const expected = startOfLocalDay(new Date(order.expectedArrivalDate))
          return expected.getTime() >= today.getTime() && expected.getTime() <= sevenDaysLater.getTime()
        })
        .map((order: any) => {
          const unfinishedItemCount = purchaseDevelopmentItems.filter((item: any) =>
            item.purchaseOrderId === order.id &&
            item.productId == null &&
            ['NEW_PRODUCT', 'DIFFERENT_CRAFT', 'SKU_PENDING'].includes(item.linkStatus) &&
            (!item.opportunityExists || item.opportunity?.status !== '已完成' || !item.opportunity?.productId)
          ).length
          return { ...order, unfinishedItemCount }
        })
        .sort((a: any, b: any) => new Date(a.expectedArrivalDate).getTime() - new Date(b.expectedArrivalDate).getTime())
      const upcomingTasks = ((workTasks.tasks || []) as WorkTask[])
        .filter((task) => {
          if (task.status === '已完成') return false
          const due = startOfLocalDay(new Date(task.dueDate))
          return due.getTime() > today.getTime() && due.getTime() <= sevenDaysLater.getTime()
        })
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || priorityOrder(a.priority) - priorityOrder(b.priority))

      setBusinessTodos({
        inventoryRiskCount: activeInventoryRisk.length,
        stockoutCount: salesProducts.filter((product: any) =>
          product.businessStatus === 'ACTIVE' && product.inventoryRisk === '断货'
        ).length,
        highRiskCount: salesProducts.filter((product: any) =>
          product.businessStatus === 'ACTIVE' && product.inventoryRisk === '高风险'
        ).length,
        inventoryRiskItems: activeInventoryRisk.slice(0, 3),
        overduePurchaseCount: overduePurchaseItems.length,
        overduePurchaseItems: overduePurchaseItems.slice(0, 3),
        businessMaintenanceCount: missingBusinessProductIds.size,
        missingCostCount,
        missingPriceCount,
        missingSupplierCount,
        businessMaintenanceItems: businessMaintenanceItems.slice(0, 3),
        newProductPendingCount: unfinishedDevelopmentItems.length,
        newProductUnfiledCount: unfinishedDevelopmentItems.filter((item: any) => !item.opportunityExists).length,
        newProductInProgressCount: unfinishedDevelopmentItems.filter((item: any) =>
          item.opportunityExists && item.opportunity?.status !== '已完成'
        ).length,
        newProductPendingItems: unfinishedDevelopmentItems.slice(0, 3),
        businessStatusConflictCount: businessStatusConflicts.length,
        businessStatusConflictItems: businessStatusConflicts.slice(0, 3),
        upcomingArrivals: upcomingArrivals.slice(0, 5),
        upcomingTasks: upcomingTasks.slice(0, 5),
      })
    } catch {
      setBusinessTodos(emptyBusinessTodoStats)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        if (canSyncWorkTasks) {
          setSyncing(true)
          await fetch('/api/work-tasks/sync', { method: 'POST' })
        }
      } finally {
        setSyncing(false)
        await fetchTasks()
        await fetchUsers()
        await fetchBusinessTodos()
      }
    })()
    const t = setInterval(() => fetchTasks(), 30000)
    return () => clearInterval(t)
  }, [teamView, canSyncWorkTasks, canViewTeamTasks])

  // 根据当前视图获取任务列表
  const currentTasks = teamView && canViewTeamTasks ? allTasks : tasks

  const canManageTask = (task: WorkTask) =>
    canManageTeamTasks || task.creatorUserId === currentUserId || task.ownerUserId === currentUserId

  const canCompleteTask = (task: WorkTask) =>
    canManageTask(task) || task.assigneeUserId === currentUserId

  const categorized = useMemo(() => {
    const active = currentTasks.filter((t) => t.status !== '已完成')
    
    // 使用日期字符串比较，而不是时间戳比较
    // 只有截止日期早于今天的任务才算是逾期，今天截止的不算逾期
    const todayStr = toLocalDateKey(now)
    
    // 1. 逾期/延期任务：dueDate 早于今天 或 status === '延期'/'逾期'/'已延期'
    const delayed = active.filter((t) => {
      if (t.status === '已延期' || t.status === '延期' || t.status === '逾期') return true
      const dueDateStr = toLocalDateKey(new Date(t.dueDate))
      return dueDateStr < todayStr
    })
    
    // 2. 今日首要：isTodayMustDo === true 或 (priority === '高' 且 dueDate 是今天)
    const primary = active.filter((t) => {
      if (t.isTodayMustDo === true) return true
      const dueDateStr = toLocalDateKey(new Date(t.dueDate))
      return dueDateStr === todayStr && t.priority === '高'
    })
    
    // 3. 今日次要：isTodayMustDo !== true 且 dueDate 是今天 且 priority 为'中'或'低'
    const secondary = active.filter((t) => {
      if (t.isTodayMustDo === true) return false
      const dueDateStr = toLocalDateKey(new Date(t.dueDate))
      return dueDateStr === todayStr && (t.priority === '中' || t.priority === '低')
    })
    
    // 4. 我的自建任务：taskType === 'self'
    const mySelfTasks = active.filter((t) => t.taskType === 'self' && (teamView ? true : t.assigneeUserId === currentUserId))
    
    // 5. 待处理任务：以上都不满足的任务
    const alreadyCategorized = new Set([
      ...primary.map(t => t.id),
      ...secondary.map(t => t.id),
      ...mySelfTasks.map(t => t.id),
      ...delayed.map(t => t.id),
    ])
    const pending = active.filter((t) => !alreadyCategorized.has(t.id))
    
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
      delayed: sortList(delayed),
      pending: sortList(pending),
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

  // 检查任务是否有完成要求
  const hasCompletionRequirements = (task: WorkTask) => {
    return task.requireCompletionNote || task.requireCompletionLink || task.requireCompletionResult
  }

  // 提交完成任务
  const submitCompleteTask = async () => {
    if (!completingTask) return
    
    console.log('[submitCompleteTask] 提交完成任务')
    
    // 验证必填字段
    if (completingTask.requireCompletionNote && !completeForm.completedNote.trim()) {
      toast.error('请填写完成备注')
      return
    }
    if (completingTask.requireCompletionLink && !completeForm.completedLink.trim()) {
      toast.error('请填写完成链接')
      return
    }
    if (completingTask.requireCompletionResult && !completeForm.completedResult.trim()) {
      toast.error('请填写结果说明')
      return
    }
    
    try {
      const res = await fetch(`/api/work-tasks/${completingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: '已完成',
          completedNote: completeForm.completedNote || null,
          completedLink: completeForm.completedLink || null,
          completedResult: completeForm.completedResult || null,
        }),
      })
      
      const data = await res.json()
      
      if (res.ok) {
        // 获取执行人名称
        const assigneeName = completingTask.assigneeName || '执行人'
        toast.success(`任务已完成：${completingTask.title}，已分配给：${assigneeName}`)
        await fetchTasks()
        setCompletingTask(null)
        setCompleteForm({ completedNote: '', completedLink: '', completedResult: '' })
      } else {
        toast.error('完成失败：' + (data.error || '未知错误'))
      }
    } catch (e) {
      console.error('[submitCompleteTask] 异常:', e)
      toast.error('完成失败：' + (e as Error).message)
    }
  }

  // 处理完成任务点击
  const handleCompleteClick = (task: WorkTask) => {
    // 检查是否有完成要求
    if (hasCompletionRequirements(task)) {
      // 打开完成弹窗
      setCompletingTask(task)
      setCompleteForm({ completedNote: '', completedLink: '', completedResult: '' })
    } else {
      // 没有完成要求，直接完成
      updateTaskStatusDirect(task.id, '已完成')
    }
  }

  // 直接更新任务状态（用于没有完成要求的情况）
  const updateTaskStatusDirect = async (id: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/work-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchTasks()
        // 显示成功提示
        if (nextStatus === '已完成') {
          toast.success('任务已完成')
        }
      } else {
        toast.error('更新失败：' + (data.error || '未知错误'))
      }
    } catch (e) {
      console.error('[updateTaskStatusDirect] 异常:', e)
      toast.error('更新失败：' + (e as Error).message)
    }
  }

  const updateTaskStatus = async (id: string, nextStatus: string) => {
    // 非完成操作直接执行
    if (nextStatus !== '已完成') {
      await updateTaskStatusDirect(id, nextStatus)
      return
    }
    
    // 完成操作需要先检查任务要求
    const task = tasks.find(t => t.id === id) || allTasks.find(t => t.id === id)
    if (!task) {
      console.error('[updateTaskStatus] 未找到任务:', id)
      return
    }
    
    handleCompleteClick(task)
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
  
  // 完成任务弹窗状态
  const [completingTask, setCompletingTask] = useState<WorkTask | null>(null)
  const [completeForm, setCompleteForm] = useState({
    completedNote: '',
    completedLink: '',
    completedResult: '',
  })
  // 任务类型和部门选项
  const TASK_TYPES = [
    { value: 'personal', label: '个人任务' },
    { value: 'team', label: '团队任务' },
  ]
  
  const DEPARTMENTS = [
    { value: 'product', label: '产品' },
    { value: 'operation', label: '运营' },
    { value: 'bd', label: 'BD' },
    { value: 'editor', label: '剪辑' },
    { value: 'boss', label: '老板' },
    { value: 'management', label: '管理' },
    { value: 'browse', label: '浏览' },
  ]

  const [form, setForm] = useState({
    title: '',
    sourceModule: '产品',
    taskType: 'personal' as 'personal' | 'team',
    priority: '中',
    assigneeUserId: currentUserId,
    ownerUserId: currentUserId,
    dueDate: dayKey,
    remindAt: '',
    isTodayMustDo: false,
    relatedEntityId: '',
    note: '',
    // 团队任务字段
    department: '',
    // 协作执行人（多选）
    collaboratorUserIds: [] as string[],
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
        toast.error('请填写任务标题')
        return
      }
      if (!form.assigneeUserId) {
        console.log('[submitCreate] 验证失败：执行人为空')
        toast.error('请选择执行人')
        return
      }

      console.log('[submitCreate] 验证通过，准备发送请求')

      const due = form.dueDate ? new Date(`${form.dueDate}T18:00:00`) : new Date()
      due.setHours(18, 0, 0, 0)
      
      const remindAt = form.remindAt ? new Date(`${form.remindAt}:00`) : null
      
      const payload = {
        title: form.title.trim(),
        sourceModule: form.sourceModule,
        taskType: canAssignTasks ? form.taskType : 'personal',
        priority: form.priority,
        assigneeUserId: canAssignTasks ? form.assigneeUserId : currentUserId,
        ownerUserId: canAssignTasks ? form.ownerUserId || null : currentUserId,
        dueDate: due.toISOString(),
        remindAt: remindAt ? remindAt.toISOString() : null,
        isTodayMustDo: form.isTodayMustDo,
        status: '待做',
        note: form.note || null,
        relatedEntityId: form.relatedEntityId || '-',
        department: canAssignTasks ? form.department || null : null,
        collaboratorUserIds: canAssignTasks ? form.collaboratorUserIds : [],
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
          taskType: 'personal',
          priority: '中',
          assigneeUserId: currentUserId,
          ownerUserId: currentUserId,
          dueDate: dayKey,
          remindAt: '',
          isTodayMustDo: false,
          relatedEntityId: '',
          note: '',
          department: '',
          collaboratorUserIds: [],
          requireCompletionNote: false,
          requireCompletionLink: false,
          requireCompletionResult: false,
        })
        // 立即刷新任务列表，确保页面立即显示新任务
        await fetchTasks()
        console.log('[submitCreate] 刷新完成')
      } else {
        console.log('[submitCreate] 创建失败:', data.error)
        toast.error(data.error || '创建失败')
      }
    } catch (e) {
      console.error('[submitCreate] 异常:', e)
      toast.error('创建失败：' + (e as Error).message)
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
    if (!canManageTask(editingTask)) {
      setEditingTask(null)
      return
    }
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

  const hasAnyTask = categorized.primary.length > 0 || categorized.secondary.length > 0 || categorized.mySelfTasks.length > 0 || categorized.delayed.length > 0 || categorized.pending.length > 0
  const businessTodoItems = [
    {
      title: '库存高风险',
      count: businessTodos.inventoryRiskCount,
      description: businessTodos.inventoryRiskCount > 0
        ? `${businessTodos.stockoutCount} 个 ACTIVE 商品已断货，${businessTodos.highRiskCount} 个可售天数 ≤ 7。`
        : '✓ ACTIVE 商品暂无断货或 7 天内高风险。',
      href: '/dashboard/product-sales',
      action: '去销售分析',
      icon: '!',
      tone: businessTodos.inventoryRiskCount > 0 ? 'rose' : 'slate',
      details: businessTodos.inventoryRiskItems.map((product: any) => ({
        title: product.sku || product.name || '-',
        meta: product.inventoryRisk === '断货'
          ? `断货 · 近30天售 ${product.monthSales || 0}`
          : `预计可售 ${product.currentSellableDays ?? '—'} 天`,
      })),
    },
    {
      title: '采购逾期',
      count: businessTodos.overduePurchaseCount,
      description: businessTodos.overduePurchaseCount > 0
        ? '存在预计到货日早于今天的未完成采购单。'
        : '✓ 暂无采购逾期。',
      href: '/dashboard/inventory-purchasing?tab=orders',
      action: '去订货/在途',
      icon: '↗',
      tone: businessTodos.overduePurchaseCount > 0 ? 'amber' : 'slate',
      details: businessTodos.overduePurchaseItems.map((order: any) => ({
        title: getSupplierName(order),
        meta: `${order.orderNo || '-'} · 逾期 ${order.overdueDays || 0} 天 · 待到 ${order.openQty || 0} 件`,
      })),
    },
    {
      title: '商品经营资料待维护',
      count: businessTodos.businessMaintenanceCount,
      description: businessTodos.businessMaintenanceCount > 0
        ? `${businessTodos.missingCostCount} 个缺成本，${businessTodos.missingPriceCount} 个缺售价，${businessTodos.missingSupplierCount} 个缺 Supplier。`
        : '✓ ACTIVE 商品经营资料暂无待维护项。',
      href: '/dashboard/inventory-purchasing?tab=business',
      action: '去商品经营',
      icon: '•',
      tone: businessTodos.businessMaintenanceCount > 0 ? 'orange' : 'slate',
      details: businessTodos.businessMaintenanceItems.map((item: any) => ({
        title: item.sku || item.name || '-',
        meta: (item.missingFields || []).join(' · '),
      })),
    },
    {
      title: '新品待处理',
      count: businessTodos.newProductPendingCount,
      description: businessTodos.newProductPendingCount > 0
        ? `${businessTodos.newProductUnfiledCount} 条未建档，${businessTodos.newProductInProgressCount} 条开发档案未完成。`
        : '✓ 采购来源新品暂无待处理项。',
      href: '/dashboard/products/opportunities',
      action: '去新品开发池',
      icon: '+',
      tone: businessTodos.newProductPendingCount > 0 ? 'blue' : 'slate',
      details: businessTodos.newProductPendingItems.map((item: any) => ({
        title: item.productNameSnapshot || '-',
        meta: `${item.linkStatusLabel || item.linkStatus || '未标记'} · ${item.supplierName || '未填写供应商'} · ${getPurchaseDevelopmentState(item)}`,
      })),
    },
    {
      title: '经营状态异常',
      count: businessTodos.businessStatusConflictCount,
      description: businessTodos.businessStatusConflictCount > 0
        ? '缺货下架/停售商品近期仍出现销售记录。'
        : '✓ 暂无经营状态与销售冲突。',
      href: '/dashboard/inventory-purchasing?tab=business',
      action: '去商品经营',
      icon: '!',
      tone: businessTodos.businessStatusConflictCount > 0 ? 'amber' : 'slate',
      details: businessTodos.businessStatusConflictItems.map((product: any) => ({
        title: product.sku || product.name || '-',
        meta: `当前：${product.stockStatus || product.businessStatus} · 近7天仍有 ${product.weekSales || 0} 单`,
      })),
    },
  ]

  const activeBusinessTodoItems = businessTodoItems.filter((item) => item.count > 0)
  const resolvedBusinessTodoTitles = businessTodoItems
    .filter((item) => item.count === 0)
    .map((item) => item.title)

  const todoToneClasses: Record<string, string> = {
    rose: 'border-rose-200 bg-rose-50/40 text-rose-700',
    amber: 'border-amber-200 bg-amber-50/40 text-amber-700',
    orange: 'border-orange-200 bg-orange-50/40 text-orange-700',
    blue: 'border-blue-200 bg-blue-50/40 text-blue-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-400',
  }

  const shortcuts = [
    { title: '导入订单', href: '/dashboard/product-sales' },
    { title: '库存导入', href: '/dashboard/inventory-purchasing?tab=import' },
    { title: '新建采购', href: '/dashboard/inventory-purchasing?tab=orders' },
    { title: '新品建档', href: '/dashboard/products/opportunities' },
  ]

  const taskSummaryItems = [
    { label: '今日首要', value: categorized.primary.length, color: 'bg-green-500' },
    { label: '今日次要', value: categorized.secondary.length, color: 'bg-blue-400' },
    { label: '逾期/延期', value: categorized.delayed.length, color: 'bg-red-500' },
    { label: '待处理', value: categorized.pending.length, color: 'bg-gray-400' },
    { label: '自建任务', value: categorized.mySelfTasks.length, color: 'bg-purple-400' },
  ]

  const uniqueTasks = (items: WorkTask[]) => {
    const seen = new Set<string>()
    return items.filter((task) => {
      if (seen.has(task.id)) return false
      seen.add(task.id)
      return true
    })
  }

  const prioritizedFocusTasks = uniqueTasks([
    ...categorized.delayed,
    ...categorized.primary,
    ...categorized.secondary,
    ...categorized.pending,
    ...categorized.mySelfTasks,
  ]).slice(0, 8)

  const fullTaskGroups = [
    { title: '今日首要', tasks: categorized.primary, color: 'bg-green-500' },
    { title: '今日次要', tasks: categorized.secondary, color: 'bg-blue-400' },
    { title: '自建任务', tasks: categorized.mySelfTasks, color: 'bg-purple-400' },
    { title: '逾期/延期', tasks: categorized.delayed, color: 'bg-red-500', highlight: true },
    { title: '待处理', tasks: categorized.pending, color: 'bg-gray-400' },
    { title: '最近完成', tasks: categorized.completed, color: 'bg-green-500', completed: true },
  ]

  return (
    <div className="relative z-10 flex min-h-screen flex-col gap-6 bg-[#fdfcfb]">
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            今日工作台
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            先看今天需要处理的经营事项，再处理个人和团队任务。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 总负责人切换团队视图 */}
          {canViewTeamTasks && (
            <button
              type="button"
              onClick={() => setTeamView(!teamView)}
              className={`btn ${teamView ? 'btn-primary' : 'btn-secondary'}`}
            >
              {teamView ? '👁️ 我的任务' : '👥 团队任务'}
            </button>
          )}
          {canCreateTask && (
            <button type="button" onClick={() => {
              // 打开弹窗时重置表单，确保使用最新的 currentUserId
              setForm({
                title: '',
                sourceModule: '产品',
                taskType: 'personal',
                priority: '中',
                assigneeUserId: currentUserId,
                ownerUserId: currentUserId,
                dueDate: dayKey,
                remindAt: '',
                isTodayMustDo: false,
                relatedEntityId: '',
                note: '',
                department: '',
                collaboratorUserIds: [],
                requireCompletionNote: false,
                requireCompletionLink: false,
                requireCompletionResult: false,
              })
              setCreateOpen(true)
            }} className="btn-primary">
              + 新建任务
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,65fr)_minmax(320px,35fr)]">
        <div className="space-y-6">
      {/* 今日需要处理 */}
      <section className="card p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">今日需要处理</h2>
          <p className="mt-1 text-sm text-gray-500">优先显示具体对象，复用正式业务页面口径。</p>
        </div>
        {activeBusinessTodoItems.length === 0 ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-700">✓ 当前暂无经营异常</div>
            <div className="mt-1 text-sm text-emerald-700/80">
              库存、采购、商品资料、新品开发暂时没有需要处理的事项。
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeBusinessTodoItems.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => router.push(item.href)}
                className="group flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 text-left transition hover:border-brand-200 hover:shadow-sm"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${todoToneClasses[item.tone]}`}>
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold text-gray-900">{item.title}</span>
                    <span className="text-lg font-bold text-gray-900">{item.count}</span>
                  </span>
                  <span className="mt-1 block text-sm text-gray-500">{item.description}</span>
                  {item.details.length > 0 && (
                    <span className="mt-3 block space-y-1.5">
                      {item.details.map((detail: any) => (
                        <span key={`${item.title}-${detail.title}-${detail.meta}`} className="block rounded-lg bg-gray-50 px-3 py-2">
                          <span className="block text-sm font-medium text-gray-800">{detail.title}</span>
                          <span className="block text-xs text-gray-500">{detail.meta}</span>
                        </span>
                      ))}
                      {item.count > item.details.length && (
                        <span className="block text-xs text-gray-400">还有 {item.count - item.details.length} 个</span>
                      )}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-medium text-primary-600 group-hover:text-primary-700">
                  {item.action} →
                </span>
              </button>
            ))}
            {resolvedBusinessTodoTitles.length > 0 && (
              <div className="px-1 text-xs text-gray-400">
                ✓ {resolvedBusinessTodoTitles.join('、')}正常
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{teamView && canViewTeamTasks ? '团队任务' : '我的任务'}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {teamView && canViewTeamTasks
                ? '查看全员任务进度，管理排期与优先级。'
                : '保留原有任务创建、编辑、完成和延期处理能力。'}
            </p>
          </div>
        </div>

      {/* 同步状态 */}
      {syncing && (
        <div className="text-xs text-green-600 bg-green-50 rounded-lg border border-green-100 p-3 flex items-center gap-2">
          <span className="animate-pulse">●</span> 正在同步任务数据…
        </div>
      )}

      {/* 任务概览摘要 */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {taskSummaryItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${item.color}`} />
              {item.label}
            </div>
            <div className="mt-1 text-xl font-semibold text-gray-900">{item.value}</div>
          </div>
        ))}
      </div>

      {!loading && !hasAnyTask && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
          <div className="text-sm font-semibold text-emerald-700">✓ 今天暂无待处理任务</div>
          <div className="mt-1 text-sm text-emerald-700/80">
            当前没有需要处理的人工任务。
          </div>
        </div>
      )}

      {/* 有任务时默认只显示当前重点任务 */}
      {hasAnyTask && (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">当前重点任务</div>
                <div className="mt-1 text-xs text-gray-500">
                  按逾期/延期、今日首要、今日次要、待处理、自建任务排序。
                </div>
              </div>
              <span className="text-xs text-gray-400">最多显示 8 项</span>
            </div>
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {prioritizedFocusTasks.map((t) => (
                <TaskCard key={t.id} task={t} onUpdate={updateTaskStatus} onEdit={openEdit} canManage={canManageTask(t)} canComplete={canCompleteTask(t)} showAssignee={teamView} />
              ))}
            </div>
          </div>

          {/* 团队视角：按人分组展示 */}
          {teamView && canViewTeamTasks && users.length > 0 && (
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

        </>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowAllTasks(!showAllTasks)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          {showAllTasks ? '收起全部任务 ↑' : '查看全部任务 ↓'}
        </button>
      </div>

      {showAllTasks && (
        <div className="space-y-3">
          {fullTaskGroups.map((group) => (
            <section
              key={group.title}
              className={`rounded-xl border p-4 ${group.highlight ? 'border-red-100 bg-red-50/30' : 'border-gray-100 bg-white'}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className={`h-2 w-2 rounded-full ${group.color}`} />
                  {group.title}
                </div>
                <span className="text-xs text-gray-400">{group.tasks.length} 项</span>
              </div>
              {group.tasks.length === 0 ? (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">暂无任务</div>
              ) : (
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                  {group.tasks.map((t) => (
                    group.completed ? (
                      <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-gray-400">{moduleIcons[t.sourceModule] || '📋'}</span>
                          <span className="truncate text-gray-500 line-through">{t.title}</span>
                          {teamView && <span className="text-xs text-gray-400">@{t.assigneeName}</span>}
                        </div>
                        <span className="shrink-0 text-xs text-gray-400">
                          {t.completedAt ? new Date(t.completedAt).toLocaleString('zh-CN').slice(0, 16) : '已完成'}
                        </span>
                      </div>
                    ) : (
                      <TaskCard key={t.id} task={t} onUpdate={updateTaskStatus} onEdit={openEdit} canManage={canManageTask(t)} canComplete={canCompleteTask(t)} showAssignee={teamView} />
                    )
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      </section>

        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">未来 7 天</h2>
              <p className="mt-1 text-sm text-gray-500">只放有明确日期的到货和任务。</p>
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">预计到货</h3>
                  <span className="text-xs text-gray-400">{businessTodos.upcomingArrivals.length} 项</span>
                </div>
                {businessTodos.upcomingArrivals.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">未来 7 天暂无预计到货。</div>
                ) : (
                  <div className="space-y-2">
                    {businessTodos.upcomingArrivals.map((order: any) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => router.push('/dashboard/inventory-purchasing?tab=orders')}
                        className="w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-left transition hover:border-brand-200 hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-900">{formatMonthDay(order.expectedArrivalDate)}</span>
                          <span className="text-xs text-gray-400">待到 {order.openQty || 0} 件</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700">{getSupplierName(order)}</div>
                        <div className="mt-0.5 text-xs text-gray-500">{order.orderNo || '-'}</div>
                        {order.unfinishedItemCount > 0 && (
                          <div className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            ⚠ 其中 {order.unfinishedItemCount} 个新品尚未完成正式建档
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">即将到期任务</h3>
                  <span className="text-xs text-gray-400">{businessTodos.upcomingTasks.length} 项</span>
                </div>
                {businessTodos.upcomingTasks.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">未来 7 天暂无即将到期任务。</div>
                ) : (
                  <div className="space-y-2">
                    {businessTodos.upcomingTasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">{task.title}</span>
                          <span className="shrink-0 text-xs text-gray-400">{formatMonthDay(task.dueDate)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                          <span>{task.priority}优先级</span>
                          {task.assigneeName && <span>· {task.assigneeName}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* 快捷操作 */}
      <section className="rounded-xl border border-gray-100 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-gray-700">快捷操作</span>
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.title}
              type="button"
              onClick={() => router.push(shortcut.href)}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:border-brand-200 hover:bg-gray-50 hover:text-primary-700"
            >
              {shortcut.title}
            </button>
          ))}
        </div>
      </section>

      {/* 最近完成 */}
      {categorized.completed.length > 0 && (
        <section className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-600">
            <span className="text-green-500">✓</span> 最近完成
          </div>
          <div className="space-y-1.5">
            {categorized.completed.slice(0, 3).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-gray-400">{moduleIcons[t.sourceModule] || '📋'}</span>
                  <span className="truncate text-gray-500 line-through">{t.title}</span>
                  {teamView && <span className="text-xs text-gray-400">@{t.assigneeName}</span>}
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {t.completedAt ? new Date(t.completedAt).toLocaleString('zh-CN').slice(0, 16) : '已完成'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 新建任务弹窗 */}
      {createOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setCreateOpen(false)} />
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto">
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

              {/* 任务类型 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">任务类型</label>
                  {canAssignTasks ? (
                    <select
                      value={form.taskType}
                      onChange={(e) => setForm({ ...form, taskType: e.target.value as 'personal' | 'team' })}
                      className="input"
                    >
                      {TASK_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">个人任务</div>
                  )}
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

              {/* 团队任务时显示所属部门 */}
              {canAssignTasks && form.taskType === 'team' && (
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">所属部门 *</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="input"
                  >
                    <option value="">请选择部门</option>
                    {DEPARTMENTS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

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
                {canAssignTasks ? (
                  <div>
                    <label className="text-xs text-gray-600 mb-1.5 block">负责人</label>
                    <select
                      value={form.ownerUserId}
                      onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
                      className="input"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} {u.id === currentUserId ? '(我)' : ''}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-600 mb-1.5 block">负责人</label>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">{currentUserName || '我'}</div>
                  </div>
                )}
              </div>

              {/* 主执行人 */}
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">主执行人 *</label>
                {canAssignTasks ? (
                  <select
                    value={form.assigneeUserId}
                    onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}
                    className="input"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} {u.id === currentUserId ? '(我)' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">{currentUserName || '我'}</div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">主执行人对任务负主要责任</p>
              </div>

              {/* 团队任务时显示协作执行人 */}
              {canAssignTasks && form.taskType === 'team' && (
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">协作执行人（可选）</label>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          checked={form.collaboratorUserIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setForm({ ...form, collaboratorUserIds: [...form.collaboratorUserIds, u.id] })
                            } else {
                              setForm({ ...form, collaboratorUserIds: form.collaboratorUserIds.filter(id => id !== u.id) })
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">{u.name} {u.id === currentUserId ? '(我)' : ''}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">协作执行人共同参与任务执行</p>
                </div>
              )}

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
              <button 
                onClick={() => void submitCreate()} 
                disabled={!form.title.trim() || (canAssignTasks && (!form.assigneeUserId || (form.taskType === 'team' && !form.department)))} 
                className="btn-primary"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完成任务弹窗 */}
      {completingTask && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setCompletingTask(null)} />
          <div className="modal-content max-w-lg">
            <div className="modal-header">
              <div className="text-base font-semibold">完成任务</div>
              <div className="text-xs text-gray-500 mt-1">{completingTask.title}</div>
            </div>
            <div className="modal-body space-y-4">
              {/* 任务信息 */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">任务信息</div>
                <div className="text-sm text-gray-700 mt-1">
                  <div>优先级：<span className="font-medium">{completingTask.priority}</span></div>
                  <div>截止日期：<span className="font-medium">{new Date(completingTask.dueDate).toLocaleDateString('zh-CN')}</span></div>
                  <div>执行人：<span className="font-medium">{completingTask.assigneeName || completingTask.assigneeUserId}</span></div>
                </div>
              </div>

              {/* 完成要求提示 */}
              {(completingTask.requireCompletionNote || completingTask.requireCompletionLink || completingTask.requireCompletionResult) && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <div className="text-xs font-medium text-amber-800 mb-2">完成要求</div>
                  <div className="space-y-1 text-sm text-amber-700">
                    {completingTask.requireCompletionNote && (
                      <div className="flex items-center gap-2">
                        <span>✓</span>
                        <span>必须填写完成备注</span>
                      </div>
                    )}
                    {completingTask.requireCompletionLink && (
                      <div className="flex items-center gap-2">
                        <span>✓</span>
                        <span>必须填写完成链接</span>
                      </div>
                    )}
                    {completingTask.requireCompletionResult && (
                      <div className="flex items-center gap-2">
                        <span>✓</span>
                        <span>必须填写结果说明</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 完成备注 */}
              {completingTask.requireCompletionNote && (
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">完成备注 *</label>
                  <textarea
                    value={completeForm.completedNote}
                    onChange={(e) => setCompleteForm({ ...completeForm, completedNote: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="请描述任务完成情况..."
                  />
                </div>
              )}

              {/* 完成链接 */}
              {completingTask.requireCompletionLink && (
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">完成链接 *</label>
                  <input
                    value={completeForm.completedLink}
                    onChange={(e) => setCompleteForm({ ...completeForm, completedLink: e.target.value })}
                    className="input"
                    placeholder="https://..."
                  />
                </div>
              )}

              {/* 结果说明 */}
              {completingTask.requireCompletionResult && (
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">结果说明 *</label>
                  <textarea
                    value={completeForm.completedResult}
                    onChange={(e) => setCompleteForm({ ...completeForm, completedResult: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="请描述任务完成的结果和产出..."
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setCompletingTask(null)} className="btn-secondary">取消</button>
              <button onClick={() => void submitCompleteTask()} className="btn-primary">确认完成</button>
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

              {editingTask && canManageTask(editingTask) && (
                <>
                  {canAssignTasks && (
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
                  )}

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
function TaskCard({ task, onUpdate, onEdit, canManage, canComplete, showAssignee }: { 
  task: WorkTask; 
  onUpdate: (id: string, status: string) => void;
  onEdit: (task: WorkTask) => void;
  canManage: boolean;
  canComplete: boolean;
  showAssignee?: boolean;
}) {
  const priorityColors: Record<string, string> = {
    '高': 'text-red-600 bg-red-50',
    '中': 'text-amber-600 bg-amber-50',
    '低': 'text-gray-600 bg-gray-50',
  }

  return (
    <div className={`rounded-lg border p-3 hover:shadow-md transition-all ${
      task.status === '已延期' ? 'border-red-100 bg-red-50/50' : 
      task.isTodayMustDo ? 'border-green-100 bg-green-50/50' :
      'border-gray-100 bg-white'
    } ${canManage ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => {
      if (canManage) onEdit(task)
    }}>
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

      {canComplete && (
        <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {task.status === '待做' && (
            <button onClick={() => onUpdate(task.id, '进行中')} className="btn-secondary text-xs py-1 px-2">开始</button>
          )}
          {task.status !== '已完成' && (
            <button onClick={() => onUpdate(task.id, '已完成')} className="btn-primary text-xs py-1 px-2">完成</button>
          )}
        </div>
      )}
    </div>
  )
}
