import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@test.com').trim()
  const adminPassword = (process.env.ADMIN_PASSWORD || (process.env as any).ADMIN_PASSWORDyuhan || 'password').trim()
  const adminName = (process.env.ADMIN_NAME || '管理员').trim()

  // 创建管理员账号（建议在生产环境通过环境变量设置 ADMIN_EMAIL/ADMIN_PASSWORD）
  const hashedPassword = await bcrypt.hash(adminPassword, 10)
  
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: adminName,
      role: 'admin',
    },
    update: {
      password: hashedPassword,
      name: adminName,
      role: 'admin',
    },
  })

  // 创建默认配置
  await prisma.config.upsert({
    where: { key: 'exchange_rate' },
    create: { key: 'exchange_rate', value: '7.2' },
    update: { value: '7.2' },
  })

  await prisma.config.upsert({
    where: { key: 'stock_warning_threshold' },
    create: { key: 'stock_warning_threshold', value: '10' },
    update: { value: '10' },
  })

  await prisma.config.upsert({
    where: { key: 'profit_margin_warning_threshold' },
    create: { key: 'profit_margin_warning_threshold', value: '20' },
    update: { value: '20' },
  })

  console.log('Seed completed!')
  console.log(`Admin account: ${adminEmail}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
