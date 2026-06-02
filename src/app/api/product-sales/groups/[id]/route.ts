import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { prisma } from '@/lib/prisma'

function normalizeSkus(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
}

async function requireOperator() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'productSales')) {
    return { error: NextResponse.json({ error: '无权限操作销售库存' }, { status: 403 }) }
  }

  return { error: null }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const id = String(params.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: '分组 ID 不能为空' }, { status: 400 })
    }

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const skus = normalizeSkus(body?.skus)

    if (!name) {
      return NextResponse.json({ error: '分组名称不能为空' }, { status: 400 })
    }

    const duplicate = await prisma.productSalesGroup.findFirst({
      where: {
        name,
        NOT: { id },
      },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json({ error: '分组名称已存在' }, { status: 400 })
    }

    const group = await prisma.productSalesGroup.update({
      where: { id },
      data: {
        name,
        skus,
      },
    })

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        skus: Array.isArray(group.skus) ? group.skus : [],
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('更新产品销售分组失败:', error)
    return NextResponse.json({ error: '更新产品销售分组失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const id = String(params.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: '分组 ID 不能为空' }, { status: 400 })
    }

    await prisma.productSalesGroup.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除产品销售分组失败:', error)
    return NextResponse.json({ error: '删除产品销售分组失败' }, { status: 500 })
  }
}
