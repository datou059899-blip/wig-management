import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  
  // 获取预警配置
  const configs = await prisma.config.findMany()
  const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]))
  const exchangeRate = parseFloat(configMap.exchange_rate || '7.2')
  const stockWarningThreshold = parseInt(configMap.stock_warning_threshold || '10')
  const profitThreshold = parseFloat(configMap.profit_margin_warning_threshold || '20')

  const userRole = (session?.user as any)?.role

  const [totalProducts, totalSynced, products] = await Promise.all([
    prisma.product.count(),
    prisma.tiktokSync.count(),
    prisma.product.findMany({
      include: { tiktokSync: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const calcEffectivePrice = (p: any) =>
    (p.discountPriceUsd ?? p.tiktokDiscountPriceUsd ?? p.priceUsd ?? 0) as number

  const calcProfitMargin = (p: any) => {
    const effectivePrice = calcEffectivePrice(p)
    const costUsd = (p.costCny || 0) * exchangeRate
    const profit =
      effectivePrice -
      costUsd -
      (p.firstLegLogisticsCostUsd || 0) -
      (p.lastLegLogisticsCostUsd || 0) -
      (p.influencerCommissionUsd || 0) -
      (p.adCostUsd || 0)
    const margin = effectivePrice > 0 ? (profit / effectivePrice) * 100 : 0
    return { profit, margin, effectivePrice, costUsd }
  }

  // 1) 缺信息：图片 / 描述 / 成本 / 售价 任一缺失
  const missingInfo = products.filter(p => {
    const missing =
      !p.image ||
      !p.description ||
      !p.costCny ||
      !p.priceUsd
    return missing
  })

  // 2) TikTok 价格异常：对比 TikTok 同步价与系统标价（差异过大）
  const abnormalTikTokPrice = products.filter(p => {
    const synced = p.tiktokSync?.priceUsd
    const base = p.priceUsd || 0
    if (!synced || base <= 0) return false
    const diffRatio = Math.abs(synced - base) / base
    return diffRatio >= 0.2
  })

  // 3) 毛利过低
  const lowProfit = products.filter(p => {
    const { margin } = calcProfitMargin(p)
    return margin < profitThreshold
  })

  // 4) 库存快断货
  const lowStock = products.filter(p => (p.stock || 0) < stockWarningThreshold)

  // 5) 适合继续投放：不缺信息、库存充足、毛利率健康、且有 TikTok 同步数据
  const goodToScale = products.filter(p => {
    const { margin } = calcProfitMargin(p)
    const okMargin = margin >= Math.max(profitThreshold, 20)
    const okStock = (p.stock || 0) >= stockWarningThreshold
    const okInfo = !missingInfo.some(m => m.id === p.id)
    const hasTikTok = !!p.tiktokSync
    return okMargin && okStock && okInfo && hasTikTok
  })

  const topN = <T,>(arr: T[], n = 5) => arr.slice(0, n)
  const roleLabel =
    userRole === 'admin' ? '管理员' :
    userRole === 'operator' ? '运营' :
    userRole === 'advertiser' ? '投手' :
    userRole === 'editor' ? '剪辑师' : '用户'

  const todayTotalIssues =
    missingInfo.length +
    abnormalTikTokPrice.length +
    lowProfit.length +
    lowStock.length

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-sm text-gray-500">
                {roleLabel} · {session?.user?.name || session?.user?.email}
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold text-gray-900">
                假发 · TikTok 经营驾驶舱
              </h1>
              <p className="mt-2 text-gray-600 max-w-2xl">
                围绕一线运营和投手的日常，聚焦今日异常商品、待处理事项和重点投放商品：发现缺信息、定位价格异常、识别低毛利与断货风险，并辅助你判断哪些假发 SKU 值得继续推量。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/products?warning=missing"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition"
                >
                  查看今日异常
                </Link>
                <Link
                  href="/dashboard/products"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 transition"
                >
                  进入产品驾驶舱
                </Link>
                <Link
                  href="/dashboard/price-check"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 transition"
                >
                  查看价格体检
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full md:w-[360px]">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs text-gray-500">今日异常项</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{todayTotalIssues}</div>
                <div className="mt-1 text-xs text-gray-500">按缺信息/价格/毛利/库存汇总</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs text-gray-500">适合继续投放</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{goodToScale.length}</div>
                <div className="mt-1 text-xs text-gray-500">毛利健康 + 库存充足</div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 bg-gray-50 px-6 md:px-8 py-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
          <span>汇率：1 CNY = {exchangeRate} USD</span>
          <span>库存阈值：{stockWarningThreshold}</span>
          <span>毛利率阈值：{profitThreshold}%</span>
          {userRole === 'admin' && (
            <Link href="/dashboard/settings" className="text-primary-700 hover:underline">
              调整阈值
            </Link>
          )}
        </div>
      </div>

      {/* 今日异常与待处理事项 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">今日异常与待处理事项</h2>
          <div className="text-sm text-gray-500">先把异常商品处理完，再决定哪些 SKU 继续放量。</div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/dashboard/products?warning=missing" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="text-sm text-gray-600">缺信息产品</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900">{missingInfo.length}</div>
              <div className="text-sm text-primary-700 group-hover:underline">去补全</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">图片/卖点/成本/售价</div>
          </Link>

          <Link href="/dashboard/price-check" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="text-sm text-gray-600">TikTok 价格异常</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900">{abnormalTikTokPrice.length}</div>
              <div className="text-sm text-primary-700 group-hover:underline">去核对</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">同步价与标价偏差 ≥ 20%</div>
          </Link>

          <Link href="/dashboard/products?warning=profit" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="text-sm text-gray-600">毛利过低</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900">{lowProfit.length}</div>
              <div className="text-sm text-primary-700 group-hover:underline">去调整</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">按折扣价/物流/佣金/广告计算</div>
          </Link>

          <Link href="/dashboard/products?warning=stock" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="text-sm text-gray-600">库存快断货</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900">{lowStock.length}</div>
              <div className="text-sm text-primary-700 group-hover:underline">去查看</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">低于阈值：{stockWarningThreshold}</div>
          </Link>
        </div>
      </div>

      {/* 今日重点商品 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">今日重点商品</h2>
          <Link href="/dashboard/products" className="text-sm text-primary-700 hover:underline">
            查看全部
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-900">优先补全信息</div>
              <Link href="/dashboard/products?warning=missing" className="text-sm text-primary-700 hover:underline">打开</Link>
            </div>
            <div className="mt-3 space-y-2">
              {topN(missingInfo, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="text-gray-900 truncate max-w-[70%]">{p.name}</div>
                  <div className="text-gray-500">{p.sku || '-'}</div>
                </div>
              ))}
              {missingInfo.length === 0 && <div className="text-sm text-gray-500">今天没有缺信息的产品</div>}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-900">适合继续投放</div>
              <Link href="/dashboard/products" className="text-sm text-primary-700 hover:underline">打开</Link>
            </div>
            <div className="mt-3 space-y-2">
              {topN(
                goodToScale
                  .map(p => ({ p, m: calcProfitMargin(p).margin }))
                  .sort((a, b) => b.m - a.m)
                  .map(x => x.p),
                5,
              ).map(p => {
                const { margin } = calcProfitMargin(p)
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div className="text-gray-900 truncate max-w-[70%]">{p.name}</div>
                    <div className="text-gray-500">
                      {p.sku || '-'} · {margin.toFixed(1)}%
                    </div>
                  </div>
                )
              })}
              {goodToScale.length === 0 && <div className="text-sm text-gray-500">暂未筛到适合继续投放的产品</div>}
            </div>
          </div>
        </div>
      </div>

      {/* 数据总览 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">数据总览</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-sm text-gray-600">产品总数</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{totalProducts}</div>
            <div className="mt-1 text-xs text-gray-500">覆盖 SKU/成本/价格/库存等关键字段</div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-sm text-gray-600">TikTok SKU</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{totalSynced}</div>
            <div className="mt-1 text-xs text-gray-500">用于价格核对与投放判断</div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-sm text-gray-600">今日重点动作</div>
            <div className="mt-2 text-sm text-gray-700 space-y-1">
              <div>1) 先补全缺信息：{missingInfo.length}</div>
              <div>2) 再核对价格异常：{abnormalTikTokPrice.length}</div>
              <div>3) 调整低毛利：{lowProfit.length}</div>
              <div>4) 处理断货风险：{lowStock.length}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
