import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '当前密码和新密码必填' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少6位' }, { status: 400 });
    }

    const userId = (session.user as any).id;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 验证当前密码
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: '当前密码错误' }, { status: 400 });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码并清除修改标记
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        requirePasswordChange: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json(
      { error: '修改密码失败' },
      { status: 500 }
    );
  }
}
