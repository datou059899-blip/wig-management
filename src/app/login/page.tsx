'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('邮箱或密码错误')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-5xl w-full px-4">
        <div className="flex flex-col md:flex-row bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* 左侧：品牌与场景说明 */}
          <div className="hidden md:flex md:flex-col justify-between w-1/2 bg-gray-50 border-r border-gray-100 p-8">
            <div>
              <div className="text-sm font-medium tracking-wide text-primary-700 mb-2">
                假发 · TikTok 电商经营台
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                登录你的经营驾驶舱
              </h1>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                聚合商品成本、TikTok 价格、毛利和库存数据，让运营、投手和老板在同一张桌子上看清今日异常、待处理事项和重点投放商品。
              </p>
            </div>

            <div className="mt-8 text-xs text-gray-500 space-y-1">
              <p>· 今日异常：缺信息、价格异常、低毛利、库存预警</p>
              <p>· 待处理事项：补全商品信息、调价、补货</p>
              <p>· 重点商品：适合继续投放、重点观察的假发 SKU</p>
            </div>
          </div>

          {/* 右侧：登录表单 */}
          <div className="w-full md:w-1/2 p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 text-center md:text-left">
                账号登录
              </h2>
              <p className="mt-1 text-sm text-gray-500 text-center md:text-left">
                请输入分配给你的工作邮箱和密码。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="请输入邮箱"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="请输入密码"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </form>

            {/* 辅助说明区域 */}
            <div className="mt-6 space-y-3 text-sm text-gray-500">
              <div className="flex items-center justify-between">
                <p>忘记密码：请联系管理员在「用户管理」中重置。</p>
              </div>

              <div className="mt-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-gray-700">
                      体验账号 · 演示环境
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      当前环境仅用于产品演示和内部评估，不代表真实业务数据。
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <p>邮箱：admin@test.com</p>
                    <p>密码：password</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
