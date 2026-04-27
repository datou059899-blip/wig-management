const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyFinal() {
  console.log('=== 最终数据库结构验证 ===\n');

  // Schema 中定义的所有表
  const tables = [
    'User',
    'Product',
    'TiktokSync',
    'PerformanceDaily',
    'PerformanceMeta',
    'Config',
    'ViralScript',
    'ScriptStandardAnalysis',
    'ScriptUserAnalysis',
    'ScriptBreakdown',
    'ScriptUpdateLog',
    'TrainingTask',
    'WorkTask',
    'TikTokSyncLog',
    'Influencer',
    'InfluencerSampleShipment',
    'InfluencerSampleItem',
    'ProductOpportunity',
    'ViralVideoAnalysis',
    'OwnVideoMetric',
  ];

  let existCount = 0;
  let missingCount = 0;

  for (const tableName of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${tableName}"`);
      const count = parseInt(result[0].count);
      console.log(`✅ ${tableName.padEnd(30)} ${count.toString().padStart(4)} 条`);
      existCount++;
    } catch (e) {
      console.log(`❌ ${tableName.padEnd(30)} 表不存在`);
      missingCount++;
    }
  }

  console.log('\n=== 验证结果 ===');
  console.log(`总表数: ${tables.length}`);
  console.log(`已创建: ${existCount}`);
  console.log(`缺失:   ${missingCount}`);

  if (missingCount === 0) {
    console.log('\n✅ 数据库结构完整！');
  } else {
    console.log('\n⚠️  有表未创建，需要检查');
  }

  // 检查核心功能表
  console.log('\n=== 核心功能表检查 ===');
  const coreTables = {
    '用户管理': ['User'],
    '产品库': ['Product', 'TiktokSync'],
    '达人建联': ['Influencer', 'InfluencerSampleShipment', 'InfluencerSampleItem'],
    '今日工作台': ['WorkTask'],
    '脚本管理': ['ViralScript', 'ScriptBreakdown', 'ScriptUserAnalysis'],
    '培训任务': ['TrainingTask'],
    '经营数据': ['PerformanceDaily', 'PerformanceMeta'],
    '系统配置': ['Config'],
  };

  for (const [feature, tableList] of Object.entries(coreTables)) {
    const allExist = tableList.every(t => tables.includes(t));
    const status = allExist ? '✅' : '❌';
    console.log(`${status} ${feature.padEnd(12)} (${tableList.join(', ')})`);
  }

  await prisma.$disconnect();
}

verifyFinal().catch(e => {
  console.error('验证失败:', e);
  process.exit(1);
});
