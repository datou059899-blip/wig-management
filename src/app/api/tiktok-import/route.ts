import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 简单的API密钥认证
const API_KEY = process.env.TIKTOK_SYNC_API_KEY || 'your-secret-api-key';

function verifyApiKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7);
  return token === API_KEY;
}

// 导入订单数据
export async function POST(request: NextRequest) {
  // 验证API密钥
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, data } = body;

    // 记录同步日志
    const syncLog = await prisma.tikTokSyncLog.create({
      data: {
        type,
        status: 'success',
        dataCount: Array.isArray(data) ? data.length : 1,
        message: 'Data imported successfully'
      }
    });

    // 根据数据类型处理
    switch (type) {
      case 'orders':
        return await handleOrdersImport(data, syncLog.id);
      case 'products':
        return await handleProductsImport(data, syncLog.id);
      case 'ads':
        return await handleAdsImport(data, syncLog.id);
      default:
        return NextResponse.json({ 
          error: 'Invalid type', 
          logId: syncLog.id 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('TikTok import error:', error);
    
    // 记录失败日志
    await prisma.tikTokSyncLog.create({
      data: {
        type: 'unknown',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}

// 处理订单数据导入
async function handleOrdersImport(orders: any[], logId: string) {
  if (!Array.isArray(orders)) {
    return NextResponse.json({ error: 'Orders must be an array' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const order of orders) {
    try {
      // 尝试找到对应的产品
      const sku = order.sku || order.productSku;
      const product = sku ? await prisma.product.findUnique({ where: { sku } }) : null;

      // 创建或更新每日经营数据
      const date = new Date(order.date || order.orderDate || Date.now());
      date.setHours(0, 0, 0, 0);

      await prisma.performanceDaily.upsert({
        where: {
          date_sku: {
            date,
            sku: sku || 'unknown'
          }
        },
        update: {
          gmv: { increment: order.gmv || order.amount || 0 },
          orders: { increment: 1 }
        },
        create: {
          date,
          sku: sku || 'unknown',
          productName: product?.name || order.productName,
          productLine: product?.scene,
          owner: order.owner,
          gmv: order.gmv || order.amount || 0,
          orders: 1,
          adsCost: 0
        }
      });

      imported++;
    } catch (error) {
      console.error('Error importing order:', order, error);
      skipped++;
    }
  }

  // 更新日志
  await prisma.tikTokSyncLog.update({
    where: { id: logId },
    data: { dataCount: imported, message: `Imported ${imported} orders, skipped ${skipped}` }
  });

  return NextResponse.json({ 
    success: true, 
    imported, 
    skipped,
    logId 
  });
}

// 处理产品数据导入
async function handleProductsImport(products: any[], logId: string) {
  if (!Array.isArray(products)) {
    return NextResponse.json({ error: 'Products must be an array' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const product of products) {
    try {
      const sku = product.sku || product.productSku;
      
      if (!sku) {
        skipped++;
        continue;
      }

      // 更新TiktokSync表
      await prisma.tiktokSync.upsert({
        where: { sku },
        update: {
          skuId: product.skuId || product.tiktokSkuId,
          title: product.title || product.name,
          priceUsd: product.price || product.priceUsd || 0,
          originalPriceUsd: product.originalPrice || product.originalPriceUsd,
          stock: product.stock || product.inventory || 0,
          status: product.status,
          syncedAt: new Date()
        },
        create: {
          sku,
          skuId: product.skuId || product.tiktokSkuId,
          title: product.title || product.name,
          priceUsd: product.price || product.priceUsd || 0,
          originalPriceUsd: product.originalPrice || product.originalPriceUsd,
          stock: product.stock || product.inventory || 0,
          status: product.status
        }
      });

      imported++;
    } catch (error) {
      console.error('Error importing product:', product, error);
      skipped++;
    }
  }

  // 更新日志
  await prisma.tikTokSyncLog.update({
    where: { id: logId },
    data: { dataCount: imported, message: `Imported ${imported} products, skipped ${skipped}` }
  });

  return NextResponse.json({ 
    success: true, 
    imported, 
    skipped,
    logId 
  });
}

// 处理广告数据导入
async function handleAdsImport(adsData: any[], logId: string) {
  if (!Array.isArray(adsData)) {
    return NextResponse.json({ error: 'Ads data must be an array' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const ad of adsData) {
    try {
      const sku = ad.sku || ad.productSku;
      const date = new Date(ad.date || ad.reportDate || Date.now());
      date.setHours(0, 0, 0, 0);

      // 更新每日经营数据中的广告成本
      if (sku) {
        await prisma.performanceDaily.upsert({
          where: {
            date_sku: {
              date,
              sku
            }
          },
          update: {
            adsCost: { increment: ad.spend || ad.cost || ad.adCost || 0 }
          },
          create: {
            date,
            sku,
            productName: ad.productName,
            productLine: ad.productLine,
            owner: ad.owner,
            gmv: 0,
            orders: 0,
            adsCost: ad.spend || ad.cost || ad.adCost || 0
          }
        });
      }

      imported++;
    } catch (error) {
      console.error('Error importing ad data:', ad, error);
      skipped++;
    }
  }

  // 更新日志
  await prisma.tikTokSyncLog.update({
    where: { id: logId },
    data: { dataCount: imported, message: `Imported ${imported} ad records, skipped ${skipped}` }
  });

  return NextResponse.json({ 
    success: true, 
    imported, 
    skipped,
    logId 
  });
}

// 获取同步日志
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const logs = await prisma.tikTokSyncLog.findMany({
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ logs });
}
