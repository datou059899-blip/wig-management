import Link from 'next/link'

// 装饰性背景图案
function BackgroundPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
      
      {/* 装饰圆 */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl" />
      <div className="absolute top-1/3 -left-20 w-60 h-60 bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      
      {/* 网格线 */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />
    </div>
  )
}

// 功能卡片
function FeatureCard({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
  const colorClasses: Record<string, string> = {
    pink: 'from-pink-500/20 to-pink-600/20 border-pink-500/30',
    blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
    purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
    green: 'from-green-500/20 to-green-600/20 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
    indigo: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30',
  }
  
  const iconColors: Record<string, string> = {
    pink: 'text-pink-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    indigo: 'text-indigo-400',
  }

  return (
    <div className={`p-5 rounded-xl bg-gradient-to-br ${colorClasses[color]} border backdrop-blur-sm transition-all duration-300 hover:scale-105`}>
      <div className={`w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center mb-4 ${iconColors[color]}`}>
        {icon}
      </div>
      <div className="text-white font-semibold text-base mb-2">{title}</div>
      <div className="text-slate-400 text-sm leading-relaxed">{desc}</div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <BackgroundPattern />
      
      {/* Header */}
      <header className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/logo.png" 
                alt="Sunnymay"
                className="w-8 h-8 object-contain"
              />
              <span className="text-white font-bold text-xl">Sunnymay</span>
            </div>
            <nav className="flex gap-3">
              <Link 
                href="/login" 
                className="px-5 py-2 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-medium rounded-lg hover:from-pink-600 hover:to-pink-700 transition shadow-lg shadow-pink-500/25"
              >
                登录
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-pink-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
            假发行业专业管理工具
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            经营驾驶舱
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            聚合商品成本、TikTok 价格、毛利和库存数据，让运营、投手和老板在同一张桌子上看清业务全貌。
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto w-full">
          <FeatureCard 
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            }
            title="产品管理"
            desc="管理假发产品库，支持多维度筛选、排序和批量操作"
            color="blue"
          />
          
          <FeatureCard 
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            }
            title="TikTok 同步"
            desc="从 TikTok 后台导入 Excel，一键同步 SKU、价格、库存"
            color="pink"
          />
          
          <FeatureCard 
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
            title="毛利计算"
            desc="自动计算毛利和毛利率，支持按成本、售价维度分析"
            color="green"
          />
          
          <FeatureCard 
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
            title="智能预警"
            desc="库存预警、低毛利预警、缺信息提醒，及时发现问题"
            color="yellow"
          />
          
          <FeatureCard 
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
            title="价格对账"
            desc="对比本地定价与 TikTok 实际售价（含折扣），发现价格异常"
            color="purple"
          />
          
          <FeatureCard 
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            }
            title="多视图"
            desc="运营视图和投手视图，根据角色展示不同关注信息"
            color="indigo"
          />
        </div>

        {/* Quick Actions */}
        <div className="mt-12 text-center">
          <Link 
            href="/login" 
            className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-lg hover:from-pink-600 hover:to-pink-700 transition shadow-lg shadow-pink-500/25"
          >
            立即开始使用 →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-slate-500 text-sm">
            © {new Date().getFullYear()} Sunnymay. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
