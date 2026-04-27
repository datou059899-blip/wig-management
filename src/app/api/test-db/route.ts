import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // 获取数据库连接信息
    const dbUrl = process.env.DATABASE_URL || '';
    const directUrl = process.env.DIRECT_URL || '';
    
    // 解析连接字符串获取主机信息（隐藏密码）
    const parseUrl = (url: string) => {
      try {
        const match = url.match(/@([^:]+):/);
        return match ? match[1] : 'unknown';
      } catch {
        return 'unknown';
      }
    };
    
    const dbHost = parseUrl(dbUrl);
    const directHost = parseUrl(directUrl);
    
    // 测试数据库连接
    const result = await prisma.$queryRaw`SELECT 
      current_database() as db_name,
      version() as version
    `;
    
    // 尝试获取用户和产品数量（如果表存在）
    let userCount = 0;
    let productCount = 0;
    let tablesExist = false;
    
    try {
      [userCount, productCount] = await Promise.all([
        prisma.user.count(),
        prisma.product.count()
      ]);
      tablesExist = true;
    } catch (e) {
      // 表不存在，这是正常的对于新数据库
      tablesExist = false;
    }
    
    return NextResponse.json({
      environment: process.env.VERCEL_ENV || 'unknown',
      database: {
        host: dbHost,
        direct_host: directHost,
        ...(result as any[])[0]
      },
      tablesExist,
      counts: {
        users: userCount,
        products: productCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : String(error),
      environment: process.env.VERCEL_ENV || 'unknown',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
