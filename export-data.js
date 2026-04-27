const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function exportData() {
  try {
    console.log('Starting data export...');
    const data = {};

    // 尝试导出各表数据
    try {
      data.users = await prisma.user.findMany();
      console.log(`✓ Users: ${data.users.length} records`);
    } catch (e) { console.log('✗ Users:', e.message); }

    try {
      data.products = await prisma.product.findMany();
      console.log(`✓ Products: ${data.products.length} records`);
    } catch (e) { console.log('✗ Products:', e.message); }

    try {
      data.influencers = await prisma.influencer.findMany();
      console.log(`✓ Influencers: ${data.influencers.length} records`);
    } catch (e) { console.log('✗ Influencers:', e.message); }

    try {
      data.workTasks = await prisma.workTask.findMany();
      console.log(`✓ WorkTasks: ${data.workTasks.length} records`);
    } catch (e) { console.log('✗ WorkTasks:', e.message); }

    try {
      data.shipments = await prisma.shipment.findMany();
      console.log(`✓ Shipments: ${data.shipments.length} records`);
    } catch (e) { console.log('✗ Shipments:', e.message); }

    try {
      data.scripts = await prisma.script.findMany();
      console.log(`✓ Scripts: ${data.scripts.length} records`);
    } catch (e) { console.log('✗ Scripts:', e.message); }

    try {
      data.influencerContacts = await prisma.influencerContact.findMany();
      console.log(`✓ InfluencerContacts: ${data.influencerContacts.length} records`);
    } catch (e) { console.log('✗ InfluencerContacts:', e.message); }

    try {
      data.followUps = await prisma.followUp.findMany();
      console.log(`✓ FollowUps: ${data.followUps.length} records`);
    } catch (e) { console.log('✗ FollowUps:', e.message); }

    // 保存到文件
    fs.writeFileSync('backup-data.json', JSON.stringify(data, null, 2));
    console.log('\n✓ Data exported to backup-data.json');

  } catch (error) {
    console.error('Export failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();
