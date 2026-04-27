const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAllTables() {
  try {
    console.log('=== Supabase 数据库状态检查 ===\n');

    // 检查所有表的数据量
    const tables = [
      { name: 'User', model: prisma.user },
      { name: 'Product', model: prisma.product },
      { name: 'Influencer', model: prisma.influencer },
      { name: 'WorkTask', model: prisma.workTask },
      { name: 'Shipment', model: prisma.shipment },
      { name: 'FollowUp', model: prisma.followUp },
      { name: 'Script', model: prisma.script },
      { name: 'VideoMetric', model: prisma.videoMetric },
      { name: 'ViralVideo', model: prisma.viralVideo },
      { name: 'ProductOpportunity', model: prisma.productOpportunity },
      { name: 'SystemConfig', model: prisma.systemConfig },
      { name: 'Department', model: prisma.department },
      { name: 'Role', model: prisma.role },
      { name: 'Permission', model: prisma.permission },
      { name: 'TrainingTask', model: prisma.trainingTask },
    ];

    for (const table of tables) {
      try {
        const count = await table.model.count();
        const status = count === 0 ? '❌ 空表' : `✅ ${count} 条记录`;
        console.log(`${table.name.padEnd(25)} ${status}`);
      } catch (e) {
        console.log(`${table.name.padEnd(25)} ⚠️  表不存在或无法访问`);
      }
    }

    // 检查管理员账号
    console.log('\n=== 管理员账号 ===');
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    if (admin) {
      console.log(`✅ 管理员: ${admin.email} (${admin.name})`);
      console.log(`   创建时间: ${admin.createdAt}`);
    } else {
      console.log('❌ 无管理员账号');
    }

    // 检查系统配置
    console.log('\n=== 系统配置 ===');
    const configs = await prisma.systemConfig.findMany();
    if (configs.length > 0) {
      configs.forEach(c => console.log(`✅ ${c.key}: ${c.value}`));
    } else {
      console.log('❌ 无系统配置');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('检查失败:', error.message);
    process.exit(1);
  }
}

checkAllTables();
