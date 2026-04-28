import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const AUTH_ERRORS = {
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const

// 判断输入是邮箱还是手机号
function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

function isPhone(input: string): boolean {
  // 支持中国大陆手机号格式
  return /^1[3-9]\d{9}$/.test(input)
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: '邮箱/手机号', type: 'text' },
        password: { label: '密码', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const loginInput = credentials.email.trim()
        const password = credentials.password

        let user

        // 根据输入类型查询用户
        if (isEmail(loginInput)) {
          user = await prisma.user.findUnique({
            where: { email: loginInput }
          })
        } else if (isPhone(loginInput)) {
          user = await prisma.user.findUnique({
            where: { phone: loginInput }
          })
        } else {
          // 尝试用邮箱查询（兼容旧数据）
          user = await prisma.user.findUnique({
            where: { email: loginInput }
          })
        }

        if (!user) return null
        if ((user as any).status === 'disabled') {
          throw new Error(AUTH_ERRORS.ACCOUNT_DISABLED)
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.password
        )

        if (!isPasswordValid) {
          throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS)
        }

        return {
          id: user.id,
          email: user.email,
          phone: (user as any).phone,
          name: user.name,
          role: user.role,
          permissionMode: user.permissionMode,
          allowedPages: user.allowedPages,
          defaultHomePage: user.defaultHomePage,
          requirePasswordChange: (user as any).requirePasswordChange,
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.permissionMode = (user as any).permissionMode
        token.allowedPages = (user as any).allowedPages
        token.defaultHomePage = (user as any).defaultHomePage
        token.requirePasswordChange = (user as any).requirePasswordChange
        token.phone = (user as any).phone
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string
        (session.user as any).role = token.role as string
        (session.user as any).permissionMode = token.permissionMode as string
        (session.user as any).allowedPages = token.allowedPages as string
        (session.user as any).defaultHomePage = token.defaultHomePage as string
        (session.user as any).requirePasswordChange = token.requirePasswordChange as boolean
        (session.user as any).phone = token.phone as string
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
  },
  // 支持多域名部署（Vercel 预览链接等）
  // @ts-ignore - trustHost 是 NextAuth 支持的配置但类型定义未包含
  trustHost: true,
}
