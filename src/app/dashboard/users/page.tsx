'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_MODULES, ROLE_DEFAULT_PAGES, DEPARTMENTS, getRoleModules, canAccessUsers } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyStatePresets } from '@/components/EmptyState'

type User = {
  id: string
  email: string
  name?: string | null
  role: string
  status?: string
  defaultPage?: string | null
  department?: string | null
  notes?: string | null
  lastLoginAt?: string | null
  createdAt: string
}

// 默认首页选项
const DEFAULT_PAGE_OPTIONS = [
  { value: '', label: '跟随角色默认' },
  { value: '/dashboard', label: '工作台首页' },
  { value: '/dashboard/workbench', label: '今日工作台' },
  { value: '/dashboard/opportunities', label: '选品更新池' },
  { value: '/dashboard/products', label: '产品列表' },
  { value: '/dashboard/influencers', label: '达人建联' },
  { value: '/dashboard/scripts', label: '脚本拆解' },
  { value: '/dashboard/performance', label: '经营数据' },
]

export default function UsersPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const currentUserRole = (session?.user as any)?.role
  const isAdmin = canAccessUsers(currentUserRole)

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 创建用户表单
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<string>('operator')
  const [newDefaultPage, setNewDefaultPage] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // 编辑用户
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    role: '',
    defaultPage: '',
    department: '',
    notes: '',
  })

  // 权限说明弹窗
  const [showPermissions, setShowPermissions] = useState(false)
  const [permissionsRole, setPermissionsRole] = useState('')

  // 删除确认
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  useEffect(() => {
    if (session !== undefined && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [session, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    fetchUsers()
  }, [isAdmin])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(t)
  }, [message])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (res.ok) {
        const list: User[] = (data.users || []).map((u: any) => ({
          ...u,
          createdAt: String(u.createdAt),
          status: u.status || 'enabled',
          defaultPage: u.defaultPage || '',
          department: u.department || '',
          notes: u.notes || '',
          lastLoginAt: u.lastLoginAt || null,
        }))
        setUsers(list)
      } else {
        setMessage({ type: 'error', text: data.error || '获取用户失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '获取用户失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newEmail.trim() || !newPassword.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          password: newPassword,
          role: newRole,
          defaultPage: newDefaultPage || null,
          department: newDepartment || null,
          notes: newNotes || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '创建成功' })
        setNewEmail('')
        setNewName('')
        setNewPassword('')
        setNewRole('operator')
        setNewDefaultPage('')
        setNewDepartment('')
        setNewNotes('')
        setShowCreateForm(false)
        await fetchUsers()
      } else {
        setMessage({ type: 'error', text: data.error || '创建失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '创建失败' })
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({
      name: user.name || '',
      role: user.role,
      defaultPage: user.defaultPage || '',
      department: user.department || '',
      notes: user.notes || '',
    })
  }

  const handleUpdate = async () => {
    if (!editingUser) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name || null,
          role: editForm.role,
          defaultPage: editForm.defaultPage || null,
          department: editForm.department || null,
          notes: editForm.notes || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '更新成功' })
        setEditingUser(null)
        await fetchUsers()
      } else {
        setMessage({ type: 'error', text: data.error || '更新失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === 'disabled' ? 'enabled' : 'disabled'
    const action = nextStatus === 'disabled' ? '禁用' : '启用'
    if (!window.confirm(`确定要${action}用户 ${user.email} 吗？`)) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `已${action}用户` })
        setUsers((prev) => prev.map((x) => (x.id === user.id ? { ...x, status: nextStatus } : x)))
      } else {
        setMessage({ type: 'error', text: data.error || `${action}失败` })
      }
    } catch {
      setMessage({ type: 'error', text: `${action}失败` })
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (id: string) => {
    const confirm = window.confirm('确定要重置该用户的密码吗？重置后需要把新密码单独告知对方。')
    if (!confirm) return
    const pwd = window.prompt('请输入新的密码：')
    if (!pwd) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '密码已重置' })
      } else {
        setMessage({ type: 'error', text: data.error || '重置失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '重置失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    
    // 检查用户是否有业务数据
    const hasBusinessData = users.some(u => u.id === deletingUser.id && (
      u.email.includes('test') === false // 简化判断
    ))
    
    if (hasBusinessData) {
      const confirmDisable = window.confirm(
        `该用户可能已有业务数据，直接删除可能导致数据丢失。\n\n建议：点击"取消"然后选择"禁用"用户，而不是删除。\n\n确定要继续删除吗？`
      )
      if (!confirmDisable) {
        setDeletingUser(null)
        return
      }
    }
    
    if (!window.confirm(`确定要删除用户 ${deletingUser.email} 吗？此操作不可恢复！`)) {
      setDeletingUser(null)
      return
    }
    
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/users/${deletingUser.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '用户已删除' })
        setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id))
      } else {
        setMessage({ type: 'error', text: data.error || '删除失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '删除失败' })
    } finally {
      setSaving(false)
      setDeletingUser(null)
    }
  }

  const showRolePermissions = (role: string) => {
    setPermissionsRole(role)
    setShowPermissions(true)
  }

  if (session === undefined || !isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问用户管理，正在跳转...'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户管理"
        description="创建账号、分配角色、管理部门，控制不同角色的访问权限"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              当前共 {users.length} 个用户
            </span>
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn-primary"
            >
              + 创建用户
            </button>
          </div>
        }
      />

      {message && (
        <div className={`p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message.text}
        </div>
      )}

      {/* 用户列表 */}
      <div className="card p-6">
        <h2 className="section-title">用户列表</h2>
        
        {loading ? (
          <div className="text-center py-10 text-gray-500">加载中...</div>
        ) : users.length === 0 ? (
          <div className="card p-8">
            {EmptyStatePresets.noItems('用户', 
              <button onClick={() => setShowCreateForm(true)} className="btn-primary mt-4">
                创建第一个用户
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>角色</th>
                  <th>部门</th>
                  <th>默认首页</th>
                  <th>状态</th>
                  <th>最近登录</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium text-gray-900">{u.name || '-'}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-primary">{ROLE_LABELS[u.role] || u.role}</span>
                        <button
                          onClick={() => showRolePermissions(u.role)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          查看权限
                        </button>
                      </div>
                    </td>
                    <td className="text-sm text-gray-600">{u.department || '-'}</td>
                    <td className="text-sm text-gray-600">
                      {u.defaultPage ? DEFAULT_PAGE_OPTIONS.find(p => p.value === u.defaultPage)?.label || u.defaultPage : '-'}
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'disabled' ? 'badge-warning' : 'badge-success'}`}>
                        {u.status === 'disabled' ? '已禁用' : '启用'}
                      </span>
                    </td>
                    <td className="text-sm text-gray-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN').slice(0, 16) : '-'}
                    </td>
                    <td className="text-sm text-gray-500">
                      {new Date(u.createdAt).toLocaleString('zh-CN').slice(0, 16)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="btn-ghost text-xs py-1 px-2"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="btn-ghost text-xs py-1 px-2"
                        >
                          重置密码
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`btn-ghost text-xs py-1 px-2 ${u.status === 'disabled' ? 'text-green-600' : 'text-amber-600'}`}
                        >
                          {u.status === 'disabled' ? '启用' : '禁用'}
                        </button>
                        <button
                          onClick={() => setDeletingUser(u)}
                          className="btn-ghost text-xs py-1 px-2 text-red-600"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 创建用户弹窗 */}
      {showCreateForm && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setShowCreateForm(false)} />
          <div className="modal-content">
            <div className="modal-header">
              <div className="text-base font-semibold">创建新用户</div>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">邮箱（登录账号） *</label>
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="input"
                  placeholder="example@company.com"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">姓名</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input"
                  placeholder="可选"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">初始密码 *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  placeholder="至少6位"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">角色 *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="input"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] || r}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{ROLE_DESCRIPTIONS[newRole]}</p>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">默认首页</label>
                <select
                  value={newDefaultPage}
                  onChange={(e) => setNewDefaultPage(e.target.value)}
                  className="input"
                >
                  {DEFAULT_PAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">所属部门</label>
                <select
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="input"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">备注</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="input"
                  placeholder="可选备注信息"
                  rows={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateForm(false)} className="btn-secondary">取消</button>
              <button
                onClick={handleCreate}
                disabled={saving || !newEmail.trim() || !newPassword.trim()}
                className="btn-primary"
              >
                {saving ? '创建中...' : '创建用户'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户弹窗 */}
      {editingUser && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setEditingUser(null)} />
          <div className="modal-content">
            <div className="modal-header">
              <div className="text-base font-semibold">编辑用户</div>
              <div className="text-xs text-gray-500 mt-1">{editingUser.email}</div>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">姓名</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">角色 *</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="input"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] || r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">默认首页</label>
                <select
                  value={editForm.defaultPage}
                  onChange={(e) => setEditForm({ ...editForm, defaultPage: e.target.value })}
                  className="input"
                >
                  {DEFAULT_PAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">所属部门</label>
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="input"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">备注</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditingUser(null)} className="btn-secondary">取消</button>
              <button onClick={handleUpdate} disabled={saving} className="btn-primary">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 权限说明弹窗 */}
      {showPermissions && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setShowPermissions(false)} />
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <div className="text-base font-semibold">{ROLE_LABELS[permissionsRole]} - 权限说明</div>
            </div>
            <div className="modal-body">
              <p className="text-sm text-gray-600 mb-4">{ROLE_DESCRIPTIONS[permissionsRole]}</p>
              <div className="text-sm">
                <div className="font-medium text-gray-700 mb-2">可访问模块：</div>
                <div className="flex flex-wrap gap-2">
                  {getRoleModules(permissionsRole).map((module) => (
                    <span key={module} className="badge badge-primary">{module}</span>
                  ))}
                </div>
              </div>
              {ROLE_DEFAULT_PAGES[permissionsRole] && (
                <div className="mt-4 text-sm">
                  <div className="font-medium text-gray-700 mb-1">默认首页：</div>
                  <div className="text-gray-600">
                    {DEFAULT_PAGE_OPTIONS.find(p => p.value === ROLE_DEFAULT_PAGES[permissionsRole])?.label || ROLE_DEFAULT_PAGES[permissionsRole]}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowPermissions(false)} className="btn-primary">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deletingUser && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setDeletingUser(null)} />
          <div className="modal-content max-w-sm">
            <div className="modal-header">
              <div className="text-base font-semibold text-red-600">删除用户</div>
            </div>
            <div className="modal-body">
              <p className="text-sm text-gray-600">
                确定要删除用户 <strong>{deletingUser.email}</strong> 吗？
              </p>
              <p className="text-xs text-red-500 mt-2">
                ⚠️ 此操作不可恢复。建议优先使用"禁用"功能代替删除。
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeletingUser(null)} className="btn-secondary">取消</button>
              <button onClick={handleDelete} disabled={saving} className="btn-danger">
                {saving ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
