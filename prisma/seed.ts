import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // 创建管理员账号
  const hashedPassword = await bcrypt.hash('password', 10)
  
  await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    create: {
      email: 'admin@test.com',
      password: hashedPassword,
      name: '管理员',
      role: 'admin',
    },
    update: {
      password: hashedPassword,
      name: '管理员',
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
  console.log('Admin account: admin@test.com / password')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
