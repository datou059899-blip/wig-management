const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifySystem() {
  console.log('=== 系统稳定性验证 ===\n');

  // 1. 检查所有表是否存在
  console.log('1. 数据库表结构检查');
  console.log('-------------------');

  const tables = [
    'User', 'Product', 'Influencer', 'WorkTask', 'Shipment',
    'FollowUp', 'Script', 'VideoMetric', 'ViralVideo',
    'ProductOpportunity', 'SystemConfig', 'Department',
    'Role', 'Permission', 'TrainingTask', 'Config'
  ];

  for (const tableName of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${tableName}"`);
      const count = parseInt(result[0].count);
      console.log(`✅ ${tableName.padEnd(25)} 表存在, ${count} 条记录`);
    } catch (e) {
      console.log(`❌ ${tableName.padEnd(25)} 表不存在或无法访问`);
    }
  }

  // 2. 检查管理员账号
  console.log('\n2. 管理员账号检查');
  console.log('-------------------');

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true }
  });

  console.log(`总用户数: ${users.length}`);

  const admins = users.filter(u => u.role === 'ADMIN' || u.role === 'admin');
  console.log(`管理员数: ${admins.length}`);

  if (admins.length > 0) {
    admins.forEach(admin => {
      console.log(`✅ 管理员: ${admin.email} (角色: ${admin.role})`);
    });
  } else {
    console.log('⚠️  无管理员角色用户，需要修复');
    console.log('   现有用户角色:', users.map(u => `${u.email}(${u.role})`).join(', '));
  }

  // 3. 检查系统配置
  console.log('\n3. 系统配置检查');
  console.log('-------------------');

  try {
    const configs = await prisma.config.findMany();
    console.log(`配置项数量: ${configs.length}`);
    configs.forEach(c => {
      console.log(`✅ ${c.key}: ${c.value}`);
    });
  } catch (e) {
    console.log('❌ Config 表不存在');
  }

  // 4. 检查部门
  console.log('\n4. 部门检查');
  console.log('-------------------');

  try {
    const depts = await prisma.department.findMany();
    console.log(`部门数量: ${depts.length}`);
    depts.forEach(d => {
      console.log(`✅ ${d.name}`);
    });
  } catch (e) {
    console.log('❌ Department 表不存在');
  }

  await prisma.$disconnect();
  console.log('\n=== 验证完成 ===');
}

verifySystem().catch(e => {
  console.error('验证失败:', e);
  process.exit(1);
});
