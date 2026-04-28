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
        phone: true,
        name: true,
        role: true,
        status: true,
        department: true,
        defaultHomePage: true,
        notes: true,
        permissionMode: true,
        allowedPages: true,
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
    const email = body.email ? String(body.email).trim() : null
    const phone = body.phone ? String(body.phone).trim() : null
    const password = String(body.password || '').trim()
    const name = body.name ? String(body.name) : null
    const role = (body.role || 'operator') as string
    const status = (body.status as string) === 'disabled' ? 'disabled' : 'enabled'
    const department = body.department ? String(body.department) : null
    const defaultHomePage = body.defaultHomePage ? String(body.defaultHomePage) : '/dashboard/workbench'
    const notes = body.notes ? String(body.notes) : null
    const permissionMode = body.permissionMode === 'custom' ? 'custom' : 'role'
    const allowedPages = body.allowedPages ? String(body.allowedPages) : ''

    // 校验：邮箱和手机号至少保留一个
    if (!email && !phone) {
      return NextResponse.json({ error: '邮箱和手机号至少填写一个' }, { status: 400 })
    }

    if (!password) {
      return NextResponse.json({ error: '密码必填' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        name,
        password: hashed,
        role,
        status,
        department,
        defaultHomePage,
        notes,
        permissionMode,
        allowedPages,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        status: true,
        department: true,
        defaultHomePage: true,
        notes: true,
        permissionMode: true,
        allowedPages: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user })
  } catch (e: any) {
    console.error('创建用户失败:', e)
    if (e?.code === 'P2002') {
      // 检查是哪个字段冲突
      const target = e?.meta?.target?.[0]
      if (target === 'email') {
        return NextResponse.json({ error: '该邮箱已存在' }, { status: 400 })
      } else if (target === 'phone') {
        return NextResponse.json({ error: '该手机号已存在' }, { status: 400 })
      }
      return NextResponse.json({ error: '邮箱或手机号已存在' }, { status: 400 })
    }
    return NextResponse.json({ error: '创建用户失败' }, { status: 500 })
  }
}
