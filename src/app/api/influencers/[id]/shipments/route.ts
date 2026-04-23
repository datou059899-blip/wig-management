import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canAccess = (role?: string) =>
  role === 'admin' || role === 'lead' || role === 'operator' || role === 'influencer_operator'

const canManage = (role?: string) =>
  role === 'admin' || role === 'lead' || role === 'operator' || role === 'influencer_operator'

// GET /api/influencers/[id]/shipments - 获取达人的所有寄样记录
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canAccess(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const { id } = params

    const shipments = await prisma.influencerSampleShipment.findMany({
      where: { influencerId: id },
      include: { items: true },
      orderBy: { sampleRound: 'asc' },
    })

    return NextResponse.json({ shipments })
  } catch (e) {
    console.error('获取寄样记录失败:', e)
    return NextResponse.json({ error: '获取寄样记录失败' }, { status: 500 })
  }
}

// POST /api/influencers/[id]/shipments - 创建新的寄样记录
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canManage(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const { id } = params
    const body = await request.json()

    // 验证达人是否存在
    const influencer = await prisma.influencer.findUnique({
      where: { id },
      include: { sampleShipments: true },
    })

    if (!influencer) {
      return NextResponse.json({ error: '达人不存在' }, { status: 404 })
    }

    // 计算下一次寄样轮次
    const nextRound = influencer.sampleShipments.length + 1

    const { sampleDate, status, trackingNumber, notes, items } = body

    // 创建寄样记录和明细
    const shipment = await prisma.influencerSampleShipment.create({
      data: {
        influencerId: id,
        sampleRound: nextRound,
        sampleDate: sampleDate ? new Date(sampleDate) : new Date(),
        status: status || 'pending',
        trackingNumber: trackingNumber || null,
        notes: notes || null,
        createdBy: (session.user as any)?.name || session.user?.email || '运营',
        items: {
          create: (items || []).map((item: any) => ({
            productId: item.productId || null,
            sku: item.sku || null,
            productName: item.productName || '未命名产品',
            color: item.color || null,
            length: item.length || null,
            quantity: Number(item.quantity) || 1,
          })),
        },
      },
      include: { items: true },
    })

    return NextResponse.json({ shipment })
  } catch (e) {
    console.error('创建寄样记录失败:', e)
    return NextResponse.json({ error: '创建寄样记录失败' }, { status: 500 })
  }
}
