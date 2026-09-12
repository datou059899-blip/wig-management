'use client'

import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const INVALID_CREDENTIALS_MESSAGE = '邮箱、手机号或密码不正确，请重试。'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_DISABLED: '你的账号已被禁用，请联系管理员。',
  INVALID_CREDENTIALS: INVALID_CREDENTIALS_MESSAGE,
  CredentialsSignin: INVALID_CREDENTIALS_MESSAGE,
}

function PasswordInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative">
      <input
        id="password"
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-[#d2d2d7] bg-white px-3.5 pr-11 text-[15px] text-gray-900 outline-none transition-colors duration-150 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        placeholder="请输入密码"
        autoComplete="current-password"
        required
      />
      <button
        type="button"
        onClick={() => setShowPassword((current) => !current)}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        aria-label={showPassword ? '隐藏密码' : '显示密码'}
        title={showPassword ? '隐藏密码' : '显示密码'}
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [loginInput, setLoginInput] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const rememberedEmail = window.localStorage.getItem('rememberedEmail')
      if (rememberedEmail) {
        setLoginInput(rememberedEmail)
        setRememberEmail(true)
      }
    } catch {
      // Login remains available when browser storage is unavailable.
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: loginInput,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(AUTH_ERROR_MESSAGES[result.error] || '暂时无法登录，请稍后再试。')
      } else if (result?.ok) {
        try {
          if (rememberEmail) {
            window.localStorage.setItem('rememberedEmail', loginInput.trim())
          } else {
            window.localStorage.removeItem('rememberedEmail')
          }
        } catch {
          // Remembering the account is optional and must not block login.
        }
        router.push('/dashboard')
      } else {
        setError('暂时无法登录，请稍后再试。')
      }
    } catch {
      setError('暂时无法登录，请稍后再试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-[#f5f5f7] text-gray-900">
      <header className="bg-[#f5f5f7]">
        <div className="flex h-16 w-full items-center px-7 sm:px-8">
          <div className="flex items-baseline gap-2.5" aria-label="Sunnymay Operations">
            <span className="text-[17px] font-semibold text-gray-900">Sunnymay</span>
            <span className="text-[12px] font-normal text-gray-500">Operations</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
        <div className="w-full max-w-[420px]">
          <div className="mb-7 text-center">
            <h1 className="text-[30px] font-semibold leading-tight text-gray-950 sm:text-[32px]">
              欢迎回来
            </h1>
            <p className="mt-2 text-[17px] font-medium text-gray-700">登录 Sunnymay 运营后台</p>
            <p className="mt-2 text-[14px] leading-6 text-gray-500">
              商品、库存、采购、销售与内容运营统一管理。
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-input" className="mb-2 block text-[13px] font-medium text-gray-700">
                  邮箱 / 手机号
                </label>
                <input
                  id="login-input"
                  type="text"
                  value={loginInput}
                  onChange={(event) => setLoginInput(event.target.value)}
                  className="h-12 w-full rounded-lg border border-[#d2d2d7] bg-white px-3.5 text-[15px] text-gray-900 outline-none transition-colors duration-150 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  placeholder="请输入邮箱或手机号"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-gray-700">
                  密码
                </label>
                <PasswordInput value={password} onChange={setPassword} />
              </div>

              <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-gray-600">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(event) => setRememberEmail(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                记住登录账号
              </label>

              <div className="min-h-5" aria-live="polite">
                {error && <p className="text-[13px] leading-5 text-red-600">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {loading ? '正在登录…' : '登录'}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-[13px] text-gray-500">
            登录遇到问题？请联系管理员
          </p>
        </div>
      </main>

      <footer className="px-5 py-6 text-center text-[12px] text-gray-400">
        © 2026 Sunnymay
      </footer>
    </div>
  )
}
