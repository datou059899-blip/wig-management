#!/usr/bin/env node
/**
 * 初始化基础角色和用户
 * 用法: node init-roles.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'password123';

const ROLES = [
  { key: 'admin', name: '管理', email: 'admin@test.com' },
  { key: 'product', name: '产品', email: 'product@test.com' },
  { key: 'operator', name: '运营', email: 'operator@test.com' },
  { key: 'bd', name: 'BD', email: 'bd@test.com' },
  { key: 'editor', name: '剪辑', email: 'editor@test.com' },
  { key: 'boss', name: '老板', email: 'boss@test.com' },
  { key: 'viewer', name: '浏览', email: 'viewer@test.com' },
];

async function initRoles() {
  console.log('=== 初始化角色和用户 ===\n');

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  for (const role of ROLES) {
    try {
      const user = await prisma.user.upsert({
        where: { email: role.email },
        create: {
          email: role.email,
          password: hashedPassword,
          name: role.name,
          role: role.key,
          status: 'enabled',
        },
        update: {
          role: role.key,
          status: 'enabled',
        },
      });
      console.log(`✅ ${role.name} (${role.key}): ${user.email}`);
    } catch (e) {
      console.log(`❌ ${role.name} (${role.key}): 创建失败 - ${e.message}`);
    }
  }

  // 验证管理员
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
  });

  if (admin) {
    console.log(`\n✅ 管理员账号确认: ${admin.email} (角色: ${admin.role})`);
  } else {
    console.log('\n❌ 未找到管理员账号');
  }

  // 统计
  const counts = await prisma.user.groupBy({
    by: ['role'],
    _count: { id: true },
  });

  console.log('\n=== 角色统计 ===');
  counts.forEach(c => {
    console.log(`${c.role}: ${c._count.id} 人`);
  });

  console.log(`\n默认密码: ${DEFAULT_PASSWORD}`);
  console.log('请登录后立即修改密码！');

  await prisma.$disconnect();
}

initRoles().catch(e => {
  console.error('初始化失败:', e);
  process.exit(1);
});
