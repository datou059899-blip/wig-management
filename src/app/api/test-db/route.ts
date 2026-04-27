import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // 查询数据库信息
    const result = await prisma.$queryRaw<{ db_name: string; version: string }[]>`SELECT current_database() as db_name, version() as version`;
    
    // 查询用户数量
    const userCount = await prisma.user.count();
    
    // 查询产品数量
    const productCount = await prisma.product.count();
    
    return NextResponse.json({
      database: result[0],
      counts: {
        users: userCount,
        products: productCount,
      },
      environment: process.env.VERCEL_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      environment: process.env.VERCEL_ENV || 'development',
    }, { status: 500 });
  }
}
