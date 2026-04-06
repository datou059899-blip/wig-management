import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - 获取单个视频数据
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const video = await prisma.ownVideoMetric.findUnique({
      where: { id: params.id },
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    return NextResponse.json(video);
  } catch (error) {
    console.error("获取视频数据失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

// PUT - 更新视频数据
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const data = await request.json();
    
    const video = await prisma.ownVideoMetric.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(video);
  } catch (error) {
    console.error("更新视频数据失败:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE - 删除视频数据
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    await prisma.ownVideoMetric.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除视频数据失败:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
