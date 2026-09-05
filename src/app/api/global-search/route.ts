import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchGlobal } from '@/lib/globalSearch'
import { getSessionPermissionContext } from '@/lib/pagePermissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const permissionContext = getSessionPermissionContext(session)
    if (!permissionContext) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const q = (request.nextUrl.searchParams.get('q') || '').trim()
    if (q.length < 2) return NextResponse.json({ groups: [] })

    const currentUserId = typeof (session.user as any)?.id === 'string'
      ? (session.user as any).id
      : null
    const groups = await searchGlobal(q, permissionContext, currentUserId)

    return NextResponse.json({ groups })
  } catch (error) {
    console.error('全局搜索失败:', error)
    return NextResponse.json({ error: '全局搜索失败' }, { status: 500 })
  }
}
