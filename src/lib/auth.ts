import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const AUTH_ERRORS = {
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user) return null
        if ((user as any).status === 'disabled') {
          throw new Error(AUTH_ERRORS.ACCOUNT_DISABLED)
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS)
        }

        return {
          id: user.id,
          email: user.email,
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
