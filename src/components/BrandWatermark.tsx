'use client'

/**
 * Dashboard 全局品牌水印 - 使用完整 logo.png
 * 放在主内容区正中间，作为淡化背景
 */
export function BrandWatermark() {
  return (
    <div
      className="pointer-events-none select-none"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '480px',
        height: '480px',
        opacity: 0.035,
        zIndex: 0,
        backgroundImage: 'url(/logo.png)',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'contain',
        // 由于 logo 不是透明底，使用滤镜降低对比度使其融入背景
        filter: 'grayscale(100%) brightness(1.4)',
      }}
    />
  )
}

/**
 * 已废弃 - 保留导出兼容旧代码
 * @deprecated 使用全局 BrandWatermark 替代
 */
export function HomeBrandDecoration() {
  return null
}
