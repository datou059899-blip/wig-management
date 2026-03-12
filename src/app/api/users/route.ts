import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// 只有管理员可以管理用户
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

// 获取用户列表
export async function GET() {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ users })
  } catch (e) {
    console.error('获取用户列表失败:', e)
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 })
  }
}

// 创建新用户
export async function POST(request: NextRequest) {
  try {
    const { error } = await requireAdmin()
    if (error) return error

    const body = await request.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '').trim()
    const name = body.name ? String(body.name) : null
    const role = (body.role || 'operator') as string

    if (!email || !password) {
      return NextResponse.json({ error: '邮箱和密码必填' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user })
  } catch (e: any) {
    console.error('创建用户失败:', e)
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: '该邮箱已存在' }, { status: 400 })
    }
    return NextResponse.json({ error: '创建用户失败' }, { status: 500 })
  }
}

