#!/usr/bin/env node
/**
 * 业务闭环测试
 * 验证：产品、达人、任务、跟进、寄样 的完整流程
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testBusinessFlow() {
  console.log('=== 业务闭环测试 ===\n');

  const results = [];

  // 1. 新增产品
  console.log('1. 新增产品测试');
  console.log('-------------------');
  try {
    const product = await prisma.product.create({
      data: {
        name: '测试假发产品',
        sku: 'TEST-SKU-001',
        costCny: 100,
        priceUsd: 50,
        stock: 100,
        material: '真人发',
        length: '20inch',
        color: '自然黑',
      },
    });

    // 验证刷新后仍存在
    const found = await prisma.product.findUnique({
      where: { id: product.id },
    });

    if (found) {
      console.log(`✅ 产品创建成功: ${found.name} (ID: ${found.id})`);
      console.log(`✅ 刷新验证通过: 产品仍存在`);
      console.log(`   使用表: Product`);
      results.push({ step: '新增产品', status: '成功', table: 'Product' });
    } else {
      throw new Error('产品创建后无法查询');
    }
  } catch (e) {
    console.log(`❌ 失败: ${e.message}`);
    results.push({ step: '新增产品', status: '失败', error: e.message });
  }

  // 2. 新增达人
  console.log('\n2. 新增达人测试');
  console.log('-------------------');
  let influencerId = null;
  try {
    const influencer = await prisma.influencer.create({
      data: {
        nickname: '测试达人',
        platform: 'TikTok',
        country: 'US',
        followers: 10000,
        status: 'to_outreach',
        owner: '运营',
        potential: 'A',
        email: 'test@influencer.com',
      },
    });
    influencerId = influencer.id;

    const found = await prisma.influencer.findUnique({
      where: { id: influencer.id },
    });

    if (found) {
      console.log(`✅ 达人创建成功: ${found.nickname} (ID: ${found.id})`);
      console.log(`✅ 刷新验证通过: 达人仍存在`);
      console.log(`   使用表: Influencer`);
      results.push({ step: '新增达人', status: '成功', table: 'Influencer' });
    } else {
      throw new Error('达人创建后无法查询');
    }
  } catch (e) {
    console.log(`❌ 失败: ${e.message}`);
    results.push({ step: '新增达人', status: '失败', error: e.message });
  }

  // 3. 新增任务
  console.log('\n3. 新增任务测试');
  console.log('-------------------');
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } });

    const task = await prisma.workTask.create({
      data: {
        taskKey: `TASK-${Date.now()}`,
        title: '测试任务',
        sourceModule: 'test',
        priority: 'medium',
        dueDate: new Date(),
        status: 'todo',
        relatedEntityId: 'test-entity',
        assigneeUserId: admin?.id,
        creatorUserId: admin?.id,
      },
    });

    const found = await prisma.workTask.findUnique({
      where: { id: task.id },
    });

    if (found) {
      console.log(`✅ 任务创建成功: ${found.title} (ID: ${found.id})`);
      console.log(`✅ 刷新验证通过: 任务仍存在`);
      console.log(`   使用表: WorkTask`);
      results.push({ step: '新增任务', status: '成功', table: 'WorkTask' });
    } else {
      throw new Error('任务创建后无法查询');
    }
  } catch (e) {
    console.log(`❌ 失败: ${e.message}`);
    results.push({ step: '新增任务', status: '失败', error: e.message });
  }

  // 4. 给达人新增跟进记录
  console.log('\n4. 达人跟进记录测试');
  console.log('-------------------');
  if (influencerId) {
    try {
      // Influencer 的跟进记录存储在 timeline JSON 字段中
      const influencer = await prisma.influencer.update({
        where: { id: influencerId },
        data: {
          timeline: {
            create: [
              {
                id: `followup-${Date.now()}`,
                at: new Date().toISOString(),
                by: 'admin',
                type: 'followup',
                channel: 'email',
                responseStatus: 'pending',
                note: '测试跟进记录',
                nextAction: '等待回复',
              },
            ],
          },
          lastFollowUpAt: new Date(),
          lastFollowUpNote: '测试跟进记录',
        },
      });

      const found = await prisma.influencer.findUnique({
        where: { id: influencerId },
      });

      if (found && found.lastFollowUpNote === '测试跟进记录') {
        console.log(`✅ 跟进记录添加成功`);
        console.log(`✅ 刷新验证通过: 跟进记录仍存在`);
        console.log(`   使用表: Influencer (timeline 字段)`);
        results.push({ step: '达人跟进记录', status: '成功', table: 'Influencer.timeline' });
      } else {
        throw new Error('跟进记录添加后无法查询');
      }
    } catch (e) {
      console.log(`❌ 失败: ${e.message}`);
      results.push({ step: '达人跟进记录', status: '失败', error: e.message });
    }
  } else {
    console.log('⚠️  跳过: 没有可用的达人ID');
    results.push({ step: '达人跟进记录', status: '跳过', reason: '无达人ID' });
  }

  // 5. 给达人新增寄样记录
  console.log('\n5. 达人寄样记录测试');
  console.log('-------------------');
  if (influencerId) {
    try {
      const shipment = await prisma.influencerSampleShipment.create({
        data: {
          influencerId: influencerId,
          sampleRound: 1,
          status: 'pending',
          notes: '测试寄样',
        },
      });

      // 添加寄样商品
      const item = await prisma.influencerSampleItem.create({
        data: {
          shipmentId: shipment.id,
          productName: '测试假发',
          sku: 'TEST-SKU-001',
          quantity: 1,
        },
      });

      // 验证刷新后仍存在
      const foundShipment = await prisma.influencerSampleShipment.findUnique({
        where: { id: shipment.id },
        include: { items: true },
      });

      if (foundShipment && foundShipment.items.length > 0) {
        console.log(`✅ 寄样记录创建成功: 第${foundShipment.sampleRound}次寄样`);
        console.log(`✅ 寄样商品添加成功: ${foundShipment.items[0].productName}`);
        console.log(`✅ 刷新验证通过: 寄样记录仍存在`);
        console.log(`   使用表: InfluencerSampleShipment, InfluencerSampleItem`);
        results.push({ step: '达人寄样记录', status: '成功', table: 'InfluencerSampleShipment, InfluencerSampleItem' });
      } else {
        throw new Error('寄样记录创建后无法查询');
      }
    } catch (e) {
      console.log(`❌ 失败: ${e.message}`);
      results.push({ step: '达人寄样记录', status: '失败', error: e.message });
    }
  } else {
    console.log('⚠️  跳过: 没有可用的达人ID');
    results.push({ step: '达人寄样记录', status: '跳过', reason: '无达人ID' });
  }

  // 汇总结果
  console.log('\n=== 测试结果汇总 ===');
  console.log('-------------------');
  results.forEach((r, i) => {
    const icon = r.status === '成功' ? '✅' : r.status === '失败' ? '❌' : '⚠️';
    console.log(`${icon} ${i + 1}. ${r.step}: ${r.status}`);
    if (r.table) console.log(`   使用表: ${r.table}`);
    if (r.error) console.log(`   错误: ${r.error}`);
    if (r.reason) console.log(`   原因: ${r.reason}`);
  });

  const successCount = results.filter(r => r.status === '成功').length;
  const failCount = results.filter(r => r.status === '失败').length;

  console.log(`\n总计: ${successCount} 成功, ${failCount} 失败`);

  await prisma.$disconnect();
}

testBusinessFlow().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
