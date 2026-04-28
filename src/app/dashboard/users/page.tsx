'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { canAccessUsers } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'
import { PAGE_PERMISSIONS, getUserAllowedPages, validateDefaultHomePage } from '@/lib/pagePermissions'

type User = {
  id: string
  email: string | null
  phone: string | null
  name?: string | null
  role: string
  status?: string
  department?: string | null
  defaultHomePage?: string | null
  notes?: string | null
  permissionMode?: string
  allowedPages?: string
  createdAt: string
}

const ROLES = [
  { value: 'admin', label: '管理' },
  { value: 'boss', label: '老板' },
  { value: 'product', label: '产品' },
  { value: 'operator', label: '运营' },
  { value: 'bd', label: 'BD' },
  { value: 'editor', label: '剪辑' },
  { value: 'viewer', label: '浏览' },
]

const DEPARTMENTS = ['产品部', '运营部', 'BD部', '剪辑部', '管理层']

// 页面分组
const PAGE_CATEGORIES = {
  '工作台': ['workbench'],
  '产品': ['products', 'productOpportunities'],
  '达人': ['influencers'],
  '内容': ['scripts', 'viralVideos'],
  '数据': ['overview', 'videoMetrics', 'performance'],
  '工具': ['tiktokSync', 'priceCheck'],
  '系统': ['users', 'settings'],
}

// 密码输入框组件（带显示/隐藏切换）
function PasswordInput({ 
  value, 
  onChange, 
  placeholder = "••••••••"
}: { 
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg pr-10"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        tabIndex={-1}
      >
        {showPassword ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}

export default function UsersPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const currentUserRole = (session?.user as any)?.role
  const isAdmin = canAccessUsers(currentUserRole)

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 编辑用户
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'operator',
    department: '',
    status: 'enabled',
    defaultHomePage: '/dashboard/workbench',
    notes: '',
    permissionMode: 'role',
    allowedPages: [] as string[],
  })

  useEffect(() => {
    if (session !== undefined && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [session, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    fetchUsers()
  }, [isAdmin])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (res.ok) {
        setUsers(data.users || [])
      }
    } catch (e) {
      console.error('获取用户失败:', e)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEditForm({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'operator',
      department: '',
      status: 'enabled',
      defaultHomePage: '/dashboard/workbench',
      notes: '',
      permissionMode: 'role',
      allowedPages: [],
    })
  }

  const handleCreate = () => {
    setIsCreating(true)
    resetForm()
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      role: user.role || 'operator',
      department: user.department || '',
      status: user.status || 'enabled',
      defaultHomePage: user.defaultHomePage || '/dashboard/workbench',
      notes: user.notes || '',
      permissionMode: user.permissionMode || 'role',
      allowedPages: user.allowedPages ? user.allowedPages.split(',').filter(Boolean) : [],
    })
  }

  const validateForm = () => {
    // 创建时：邮箱和手机号至少填写一个
    if (isCreating && !editForm.email && !editForm.phone) {
      setMessage({ type: 'error', text: '邮箱和手机号至少填写一个' })
      return false
    }
    // 创建时：密码必填
    if (isCreating && !editForm.password) {
      setMessage({ type: 'error', text: '密码必填' })
      return false
    }
    // 编辑时：如果清空了邮箱和手机号，提示错误
    if (!isCreating && !editForm.email && !editForm.phone) {
      setMessage({ type: 'error', text: '邮箱和手机号至少保留一个' })
      return false
    }
    return true
  }

  const handleCreateSubmit = async () => {
    if (!validateForm()) return
    
    setSaving(true)
    try {
      const validHomePage = validateDefaultHomePage(
        editForm.defaultHomePage,
        editForm.role,
        editForm.permissionMode,
        editForm.allowedPages.join(',')
      )

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editForm.email || null,
          phone: editForm.phone || null,
          password: editForm.password,
          name: editForm.name,
          role: editForm.role,
          department: editForm.department,
          defaultHomePage: validHomePage,
          notes: editForm.notes,
          permissionMode: editForm.permissionMode,
          allowedPages: editForm.allowedPages.join(','),
        }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: '创建成功' })
        setIsCreating(false)
        resetForm()
        fetchUsers()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '创建失败' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: '创建失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!editingUser) return
    if (!validateForm()) return
    
    setSaving(true)
    try {
      // 验证默认首页
      const validHomePage = validateDefaultHomePage(
        editForm.defaultHomePage,
        editForm.role,
        editForm.permissionMode,
        editForm.allowedPages.join(',')
      )

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email || null,
          phone: editForm.phone || null,
          role: editForm.role,
          status: editForm.status,
          department: editForm.department,
          defaultHomePage: validHomePage,
          notes: editForm.notes,
          permissionMode: editForm.permissionMode,
          allowedPages: editForm.allowedPages.join(','),
          password: editForm.password || undefined,
        }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: '保存成功' })
        setEditingUser(null)
        fetchUsers()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 'disabled' ? 'enabled' : 'disabled'
    const actionText = newStatus === 'disabled' ? '停用' : '启用'
    if (!confirm(`确定要${actionText}用户 "${user.name || user.email || user.phone}" 吗？`)) return
    
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: `${actionText}成功` })
        fetchUsers()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || `${actionText}失败` })
      }
    } catch (e) {
      setMessage({ type: 'error', text: `${actionText}失败` })
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`确定要删除用户 "${user.name || user.email || user.phone}" 吗？此操作不可恢复。`)) return
    
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setMessage({ type: 'success', text: '删除成功' })
        fetchUsers()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || '删除失败' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: '删除失败' })
    }
  }

  const handleResetPassword = async (user: User) => {
    if (!confirm(`确定要重置用户 "${user.name || user.email || user.phone}" 的密码吗？`)) return
    
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        alert(`密码重置成功！\n\n新密码: ${data.newPassword}\n\n请立即保存此密码并告知用户。`)
        setMessage({ type: 'success', text: '密码重置成功' })
      } else {
        setMessage({ type: 'error', text: data.error || '重置密码失败' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: '重置密码失败' })
    }
  }

  const togglePage = (pageId: string) => {
    setEditForm(prev => ({
      ...prev,
      allowedPages: prev.allowedPages.includes(pageId)
        ? prev.allowedPages.filter(id => id !== pageId)
        : [...prev.allowedPages, pageId],
    }))
  }

  // 获取当前有权限的页面（用于默认首页下拉选项）
  const getAllowedPagesForSelect = () => {
    const allowed = getUserAllowedPages(
      editForm.role,
      editForm.permissionMode,
      editForm.allowedPages.join(',')
    )
    return allowed.map(id => PAGE_PERMISSIONS[id as keyof typeof PAGE_PERMISSIONS]).filter(Boolean)
  }

  // 格式化用户显示名称
  const getUserDisplayName = (user: User) => {
    return user.name || user.email || user.phone || '未命名用户'
  }

  // 格式化联系方式显示
  const getContactInfo = (user: User) => {
    const parts = []
    if (user.email) parts.push(user.email)
    if (user.phone) parts.push(user.phone)
    return parts.join(' / ') || '-'
  }

  if (!isAdmin) {
    return <div className="p-6">无权限访问</div>
  }

  return (
    <div className="p-6">
      <PageHeader title="用户管理" description="管理系统用户和权限" />

      {message && (
        <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      {/* 添加用户按钮 */}
      <div className="mb-4">
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          添加用户
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">联系方式</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">姓名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">角色</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">部门</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">权限模式</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex flex-col gap-1">
                      {user.email && <span className="text-gray-900">{user.email}</span>}
                      {user.phone && <span className="text-gray-500 text-xs">{user.phone}</span>}
                      {!user.email && !user.phone && <span className="text-gray-400">-</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{user.name || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                      user.role === 'operator' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ROLES.find(r => r.value === user.role)?.label || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{user.department || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.permissionMode === 'custom' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {user.permissionMode === 'custom' ? '自定义' : '跟随角色'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.status === 'disabled' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {user.status === 'disabled' ? '禁用' : '启用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleResetPassword(user)}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        重置密码
                      </button>
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className={user.status === 'disabled' ? 'text-green-600 hover:text-green-800' : 'text-orange-600 hover:text-orange-800'}
                      >
                        {user.status === 'disabled' ? '启用' : '停用'}
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="text-red-600 hover:text-red-800"
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

      {/* 创建用户弹窗 */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">添加用户</h2>
              <p className="text-gray-500 text-sm">创建新用户账号</p>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="font-medium mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="name@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="13800138000"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">密码 *</label>
                    <PasswordInput
                      value={editForm.password}
                      onChange={(value) => setEditForm({ ...editForm, password: value })}
                      placeholder="请输入密码"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="请输入姓名"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                    <select
                      value={editForm.role}
                      onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">部门</label>
                    <select
                      value={editForm.department}
                      onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">请选择</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认首页</label>
                    <select
                      value={editForm.defaultHomePage}
                      onChange={e => setEditForm({ ...editForm, defaultHomePage: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {getAllowedPagesForSelect().map(page => (
                        <option key={page.id} value={page.path}>{page.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                    <textarea
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="可选"
                    />
                  </div>
                </div>
              </div>

              {/* 权限配置 */}
              <div className="border-t pt-6">
                <h3 className="font-medium mb-3">权限配置</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">权限模式</label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="role"
                        checked={editForm.permissionMode === 'role'}
                        onChange={e => setEditForm({ ...editForm, permissionMode: e.target.value })}
                        className="mr-2"
                      />
                      <span>跟随角色默认</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="custom"
                        checked={editForm.permissionMode === 'custom'}
                        onChange={e => setEditForm({ ...editForm, permissionMode: e.target.value })}
                        className="mr-2"
                      />
                      <span>自定义权限</span>
                    </label>
                  </div>
                </div>

                {editForm.permissionMode === 'custom' && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <p className="text-sm text-gray-600 mb-3">勾选该员工可以访问的页面：</p>
                    {Object.entries(PAGE_CATEGORIES).map(([category, pageIds]) => (
                      <div key={category} className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">{category}</h4>
                        <div className="flex flex-wrap gap-2">
                          {pageIds.map(pageId => {
                            const page = PAGE_PERMISSIONS[pageId as keyof typeof PAGE_PERMISSIONS]
                            if (!page) return null
                            const isChecked = editForm.allowedPages.includes(pageId)
                            return (
                              <label
                                key={pageId}
                                className={`flex items-center px-3 py-2 rounded border cursor-pointer transition-colors ${
                                  isChecked ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePage(pageId)}
                                  className="mr-2"
                                />
                                <span className="text-sm">{page.name}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleCreateSubmit}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建用户'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">编辑用户</h2>
              <p className="text-gray-500 text-sm">{getContactInfo(editingUser)}</p>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="font-medium mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="name@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="13800138000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                    <select
                      value={editForm.role}
                      onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">部门</label>
                    <select
                      value={editForm.department}
                      onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">请选择</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                    <select
                      value={editForm.status}
                      onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="enabled">启用</option>
                      <option value="disabled">禁用</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认首页</label>
                    <select
                      value={editForm.defaultHomePage}
                      onChange={e => setEditForm({ ...editForm, defaultHomePage: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {getAllowedPagesForSelect().map(page => (
                        <option key={page.id} value={page.path}>{page.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">新密码（留空则不修改）</label>
                    <PasswordInput
                      value={editForm.password}
                      onChange={(value) => setEditForm({ ...editForm, password: value })}
                      placeholder="输入新密码"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                    <textarea
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* 权限配置 */}
              <div className="border-t pt-6">
                <h3 className="font-medium mb-3">权限配置</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">权限模式</label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="role"
                        checked={editForm.permissionMode === 'role'}
                        onChange={e => setEditForm({ ...editForm, permissionMode: e.target.value })}
                        className="mr-2"
                      />
                      <span>跟随角色默认</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="custom"
                        checked={editForm.permissionMode === 'custom'}
                        onChange={e => setEditForm({ ...editForm, permissionMode: e.target.value })}
                        className="mr-2"
                      />
                      <span>自定义权限</span>
                    </label>
                  </div>
                </div>

                {editForm.permissionMode === 'custom' && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <p className="text-sm text-gray-600 mb-3">勾选该员工可以访问的页面：</p>
                    {Object.entries(PAGE_CATEGORIES).map(([category, pageIds]) => (
                      <div key={category} className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">{category}</h4>
                        <div className="flex flex-wrap gap-2">
                          {pageIds.map(pageId => {
                            const page = PAGE_PERMISSIONS[pageId as keyof typeof PAGE_PERMISSIONS]
                            if (!page) return null
                            const isChecked = editForm.allowedPages.includes(pageId)
                            return (
                              <label
                                key={pageId}
                                className={`flex items-center px-3 py-2 rounded border cursor-pointer transition-colors ${
                                  isChecked ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePage(pageId)}
                                  className="mr-2"
                                />
                                <span className="text-sm">{page.name}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
