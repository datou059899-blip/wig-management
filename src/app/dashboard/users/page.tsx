'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

type User = {
  id: string
  email: string
  name?: string | null
  role: string
  createdAt: string
}

const ROLE_OPTIONS = [
  'admin',
  'operator',
  'advertiser',
  'editor',
]

export default function UsersPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role
  const isAdmin = role === 'admin'

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' })

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('editor')

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
        const list: User[] = (data.users || []).map((u: any) => ({
          ...u,
          createdAt: String(u.createdAt),
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
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          password: newPassword,
          role: newRole,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '创建成功' })
        setNewEmail('')
        setNewName('')
        setNewPassword('')
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

  const handleUpdateRole = async (id: string, role: string) => {
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '已更新角色' })
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
      } else {
        setMessage({ type: 'error', text: data.error || '更新失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (id: string) => {
    const pwd = window.prompt('请输入新的密码：')
    if (!pwd) return
    setSaving(true)
    setMessage({ type: '', text: '' })
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

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">只有管理员可以访问用户管理</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
        <p className="text-gray-600">创建账号、分配角色、为剪辑师开通访问权限</p>
      </div>

      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message.text}
        </div>
      )}

      {/* 创建用户 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">创建新用户</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="邮箱（登录账号）"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="姓名（可选）"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="初始密码"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <button
            onClick={handleCreate}
            disabled={saving || !newEmail.trim() || !newPassword.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '创建中...' : '创建用户'}
          </button>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">用户列表</h2>
        {loading ? (
          <div className="text-center py-10 text-gray-500">加载中...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-10 text-gray-500">暂无用户</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">邮箱</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">姓名</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">角色</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">创建时间</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{u.email}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{u.name || '-'}</td>
                    <td className="px-4 py-2 text-sm">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded-lg text-sm"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {new Date(u.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <button
                        onClick={() => handleResetPassword(u.id)}
                        className="px-3 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                      >
                        重置密码
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

