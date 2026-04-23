import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 更新寄样记录
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; shipmentId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { shipmentId } = params
    const body = await request.json()
    const { sampleDate, status, trackingNumber, notes, items } = body

    // 先删除旧的 items
    await prisma.influencerSampleItem.deleteMany({
      where: { shipmentId }
    })

    // 更新寄样记录
    const shipment = await prisma.influencerSampleShipment.update({
      where: { id: shipmentId },
      data: {
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        status,
        trackingNumber,
        notes,
        items: {
          create: items?.map((item: any) => ({
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            color: item.color,
            length: item.length,
            quantity: item.quantity || 1
          })) || []
        }
      },
      include: {
        items: true
      }
    })

    return NextResponse.json({ shipment })
  } catch (error) {
    console.error('更新寄样记录失败:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

// 删除寄样记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; shipmentId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { shipmentId } = params

    await prisma.influencerSampleShipment.delete({
      where: { id: shipmentId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除寄样记录失败:', error)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
