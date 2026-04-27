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
      version() as version,
      inet_server_addr() as server_addr,
      inet_server_port() as server_port
    `;
    
    // 获取表统计
    const tableStats = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    
    // 获取用户和产品数量
    const [userCount, productCount] = await Promise.all([
      prisma.user.count(),
      prisma.product.count()
    ]);
    
    return NextResponse.json({
      environment: process.env.VERCEL_ENV || 'unknown',
      database: {
        host: dbHost,
        direct_host: directHost,
        ...(result as any[])[0]
      },
      counts: {
        users: userCount,
        products: productCount
      },
      tables: tableStats,
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
