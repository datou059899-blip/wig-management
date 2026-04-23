import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST() {
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
