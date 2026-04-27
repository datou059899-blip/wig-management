#!/usr/bin/env node
/**
 * 数据备份脚本
 * 用法: node backup-data.js
 * 输出: backup/backup_YYYY-MM-DD_HH-mm-ss.json
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, 'backup');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('开始备份数据...\n');

  const backup = {
    timestamp: new Date().toISOString(),
    data: {}
  };

  // 备份核心表
  const tables = [
    { name: 'users', model: prisma.user },
    { name: 'products', model: prisma.product },
    { name: 'influencers', model: prisma.influencer },
    { name: 'workTasks', model: prisma.workTask },
    { name: 'configs', model: prisma.config },
    { name: 'trainingTasks', model: prisma.trainingTask },
    { name: 'productOpportunities', model: prisma.productOpportunity },
  ];

  for (const table of tables) {
    try {
      const data = await table.model.findMany();
      backup.data[table.name] = data;
      console.log(`✅ ${table.name}: ${data.length} 条记录`);
    } catch (e) {
      console.log(`❌ ${table.name}: 备份失败 - ${e.message}`);
    }
  }

  // 保存备份文件
  const filename = `backup_${timestamp}.json`;
  const filepath = path.join(backupDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

  console.log(`\n备份完成: ${filepath}`);
  console.log(`总数据量: ${Object.values(backup.data).flat().length} 条记录`);

  await prisma.$disconnect();
}

backup().catch(e => {
  console.error('备份失败:', e);
  process.exit(1);
});
