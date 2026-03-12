import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  
  // 获取统计数据
  const [totalProducts, totalSynced, lowStockCount, lowProfitCount] = await Promise.all([
    prisma.product.count(),
    prisma.tiktokSync.count(),
    prisma.product.count({ where: { stock: { lt: 10 } } }),
    prisma.product.count({ 
      where: { 
        priceUsd: { gt: 0 },
        costCny: { gt: 0 },
      }
    }),
  ])

  // 获取预警配置
  const configs = await prisma.config.findMany()
  const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]))
  const exchangeRate = parseFloat(configMap.exchange_rate || '7.2')
  const profitThreshold = parseFloat(configMap.profit_margin_warning_threshold || '20')

  // 获取低毛利产品数
  const products = await prisma.product.findMany({
    where: { priceUsd: { gt: 0 }, costCny: { gt: 0 } },
  })
  
  const lowProfitProducts = products.filter(p => {
    const costUsd = p.costCny * exchangeRate
    const profit = p.priceUsd - costUsd
    const margin = (profit / p.priceUsd) * 100
    return margin < profitThreshold
  }).length

  const userRole = (session?.user as any)?.role

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          欢迎回来，{session?.user?.name || session?.user?.email}
        </h1>
        <p className="text-gray-600 mt-1">
          角色: {(session?.user as any)?.role === 'admin' ? '管理员' : 
                 (session?.user as any)?.role === 'operator' ? '运营' : '投手'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* 总产品数 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 bg-primary-100 rounded-lg">
              <span className="text-2xl">📦</span>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">产品总数</p>
              <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
            </div>
          </div>
        </div>

        {/* TikTok 同步数 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 bg-pink-100 rounded-lg">
              <span className="text-2xl">🔄</span>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">TikTok SKU</p>
              <p className="text-2xl font-bold text-gray-900">{totalSynced}</p>
            </div>
          </div>
        </div>

        {/* 库存预警 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">库存预警</p>
              <p className="text-2xl font-bold text-gray-900">{lowStockCount}</p>
            </div>
          </div>
        </div>

        {/* 低毛利预警 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center">
            <div className="p-3 bg-red-100 rounded-lg">
              <span className="text-2xl">📉</span>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">低毛利预警</p>
              <p className="text-2xl font-bold text-gray-900">{lowProfitProducts}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">快速操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/dashboard/products"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <span className="text-2xl mr-3">📦</span>
            <div>
              <p className="font-medium text-gray-900">产品管理</p>
              <p className="text-sm text-gray-500">查看和管理产品列表</p>
            </div>
          </a>
          
          <a
            href="/dashboard/tiktok-sync"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <span className="text-2xl mr-3">📥</span>
            <div>
              <p className="font-medium text-gray-900">导入 TikTok 数据</p>
              <p className="text-sm text-gray-500">从 Excel 导入 SKU 和价格</p>
            </div>
          </a>
          
          <a
            href="/dashboard/price-check"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <span className="text-2xl mr-3">💰</span>
            <div>
              <p className="font-medium text-gray-900">价格对账</p>
              <p className="text-sm text-gray-500">对比本地价与 TikTok 价</p>
            </div>
          </a>
        </div>
      </div>

      {/* Config Notice */}
      {userRole === 'admin' && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start">
            <span className="text-xl mr-3">ℹ️</span>
            <div>
              <p className="font-medium text-blue-900">系统配置</p>
              <p className="text-sm text-blue-700 mt-1">
                当前汇率: 1 CNY = {exchangeRate} USD
                <span className="mx-2">|</span>
                毛利率预警阈值: {profitThreshold}%
                <                span className="mx-2">|</span>
                <a href="/dashboard/settings" className="underline">修改配置</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
