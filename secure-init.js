#!/usr/bin/env node
/**
 * 安全初始化 - 重置所有密码为随机密码
 * 并输出密码重置链接
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateRandomPassword() {
  return crypto.randomBytes(8).toString('hex');
}

async function secureInit() {
  console.log('=== 安全初始化 ===\n');
  console.log('正在重置所有用户密码为随机密码...\n');

  const users = await prisma.user.findMany();
  const passwordMap = [];

  for (const user of users) {
    const newPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    passwordMap.push({
      email: user.email,
      role: user.role,
      password: newPassword,
    });

    console.log(`✅ ${user.name} (${user.role}): ${user.email}`);
  }

  console.log('\n=== 临时密码清单（请立即保存）===');
  console.log('----------------------------------------');
  passwordMap.forEach(u => {
    console.log(`${u.role.padEnd(10)} ${u.email.padEnd(25)} ${u.password}`);
  });
  console.log('----------------------------------------');

  console.log('\n⚠️  重要提示：');
  console.log('1. 请立即保存上述密码清单');
  console.log('2. 首次登录后请修改密码');
  console.log('3. 管理员可通过用户管理页面重置其他用户密码');
  console.log('4. 建议删除此脚本运行记录');

  await prisma.$disconnect();
}

secureInit().catch(e => {
  console.error('安全初始化失败:', e);
  process.exit(1);
});
