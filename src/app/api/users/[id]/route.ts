import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const requireAdmin = async () => {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { session: null, error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }
  const role = (session.user as any)?.role
  if (role !== 'admin') {
    return { session: null, error: NextResponse.json({ error: '无权限' }, { status: 403 }) }
  }
  return { session, error: null }
}

// 更新用户（角色 / 名称 / 重置密码）
export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const id = context.params.id
    const body = await request.json()

    const data: any = {}
    if (body.name !== undefined) data.name = body.name ? String(body.name) : null
    if (body.role !== undefined) data.role = String(body.role)
    if (body.password) {
      data.password = await bcrypt.hash(String(body.password), 10)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '无更新内容' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user })
  } catch (e) {
    console.error('更新用户失败:', e)
    return NextResponse.json({ error: '更新用户失败' }, { status: 500 })
  }
}

