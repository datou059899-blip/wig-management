import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST() {
  // 只允许开发环境使用
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({
      success: false,
      error: 'This endpoint is not available in production'
    }, { status: 403 })
  }

  try {
    // 删除所有现有用户
    await prisma.user.deleteMany({})
    
    // 创建主管理员账号
    const adminEmail = 'datou059899@gmail.com'
    const adminPassword = 'yuhan0429'
    const hashedPassword = await bcrypt.hash(adminPassword, 10)
    
    const user = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: '管理员',
        role: 'admin',
        status: 'active',
      }
    })
    
    return NextResponse.json({ 
      success: true, 
      message: 'Admin user reset successfully',
      email: user.email,
      password: 'yuhan0429'
    })
  } catch (error) {
    console.error('Reset admin error:', error)
    return NextResponse.json({ 
      success: false, 
      error: String(error) 
    }, { status: 500 })
  }
}
