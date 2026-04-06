import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// 设置环境变量以支持多域名
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'https://www.sunnymayhair.cn'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
