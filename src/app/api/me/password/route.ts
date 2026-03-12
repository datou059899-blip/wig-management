import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const userId = (session.user as any)?.id as string | undefined
    if (!userId) return NextResponse.json({ error: '会话无效' }, { status: 401 })

    const body = await request.json()
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '请填写旧密码和新密码' }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少 6 位' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) return NextResponse.json({ error: '旧密码不正确' }, { status: 400 })

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('修改密码失败:', e)
    return NextResponse.json({ error: '修改密码失败' }, { status: 500 })
  }
}

