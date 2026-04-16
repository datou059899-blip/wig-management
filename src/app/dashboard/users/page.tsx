'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { canAccessUsers } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'
import { PAGE_PERMISSIONS, getUserAllowedPages, validateDefaultHomePage } from '@/lib/pagePermissions'

type User = {
  id: string
  email: string
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
  { value: 'admin', label: '管理员' },
  { value: 'operator', label: '运营' },
  { value: 'viewer', label: '查看者' },
]

const DEPARTMENTS = ['运营部', '产品部', '内容部', '数据部', '管理层']

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
  const [editForm, setEditForm] = useState({
    name: '',
    role: 'operator',
    department: '',
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

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({
      name: user.name || '',
      role: user.role || 'operator',
      department: user.department || '',
      defaultHomePage: user.defaultHomePage || '/dashboard/workbench',
      notes: user.notes || '',
      permissionMode: user.permissionMode || 'role',
      allowedPages: user.allowedPages ? user.allowedPages.split(',').filter(Boolean) : [],
    })
  }

  const handleSave = async () => {
    if (!editingUser) return
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
          role: editForm.role,
          department: editForm.department,
          defaultHomePage: validHomePage,
          notes: editForm.notes,
          permissionMode: editForm.permissionMode,
          allowedPages: editForm.allowedPages.join(','),
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

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">邮箱</th>
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
                  <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
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
                    <button
                      onClick={() => handleEdit(user)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">编辑用户</h2>
              <p className="text-gray-500 text-sm">{editingUser.email}</p>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="font-medium mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
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
