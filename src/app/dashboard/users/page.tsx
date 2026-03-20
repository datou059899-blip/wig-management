'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, canAccessUsers } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'

type User = {
  id: string
  email: string
  name?: string | null
  role: string
  status?: string
  createdAt: string
}

export default function UsersPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role
  const isAdmin = canAccessUsers(role)

  useEffect(() => {
    if (session !== undefined && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [session, isAdmin, router])

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<string>('operator')

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

  const handleUpdateRole = async (id: string, newRole: string) => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '已更新角色' })
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: newRole } : u)))
      } else {
        setMessage({ type: 'error', text: data.error || '更新失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (u: User) => {
    const nextStatus = u.status === 'disabled' ? 'enabled' : 'disabled'
    const action = nextStatus === 'disabled' ? '禁用' : '启用'
    if (!window.confirm(`确定要${action}用户 ${u.email} 吗？`)) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `已${action}用户` })
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: nextStatus } : x)))
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

  if (session === undefined || !isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问用户管理，正在跳转...'}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="创建账号、分配角色、启用/禁用用户，控制不同角色的访问权限"
        actions={
          <span className="text-xs text-gray-500">
            当前共 {users.length} 个用户
          </span>
        }
      />

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
          }`}
          role="alert"
        >
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
          <div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] || r}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">{ROLE_DESCRIPTIONS[newRole] || ''}</p>
          </div>
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
          <div className="text-center py-10 text-gray-500">暂无用户。你可以在上方创建第一个管理员或运营账号。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">邮箱</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">姓名</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">角色</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">状态</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">可访问模块</th>
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
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r] || r}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-0.5">{ROLE_DESCRIPTIONS[u.role] || ''}</p>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span
                        className={
                          (u.status || 'enabled') === 'disabled'
                            ? 'text-amber-600 font-medium'
                            : 'text-green-600'
                        }
                      >
                        {(u.status || 'enabled') === 'disabled' ? '已禁用' : '启用'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 max-w-[260px]">
                      {ROLE_DESCRIPTIONS[u.role] || '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {new Date(u.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-2 text-sm space-x-2">
                      <button
                        onClick={() => handleResetPassword(u.id)}
                        className="px-3 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                      >
                        重置密码
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`px-3 py-1 text-xs rounded border ${
                          (u.status || 'enabled') === 'disabled'
                            ? 'text-green-600 border-green-200 hover:bg-green-50'
                            : 'text-amber-600 border-amber-200 hover:bg-amber-50'
                        }`}
                      >
                        {(u.status || 'enabled') === 'disabled' ? '启用' : '禁用'}
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
