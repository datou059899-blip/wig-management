import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// 生成随机密码
function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 检查管理员权限
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const userId = params.id;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 生成新密码
    const newPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码并标记需要修改
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        requirePasswordChange: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: '密码重置成功',
      newPassword,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('重置密码失败:', error);
    return NextResponse.json(
      { error: '重置密码失败' },
      { status: 500 }
    );
  }
}
