import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OTHER_VIDEO_METRIC_CATEGORY_KEY } from "@/lib/videoMetricCategories";

function isMissingTableError(error: any) {
  return error?.code === "P2021";
}

// PUT - 编辑视频分类
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const existing = await prisma.videoMetricCategory.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    const data = await request.json();
    const name = (data.name || "").trim();
    const sortOrder = Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : existing.sortOrder;
    const nextActive = typeof data.isActive === "boolean" ? data.isActive : existing.isActive;

    if (!name) {
      return NextResponse.json({ error: "分类名称不能为空" }, { status: 400 });
    }

    if (existing.key === OTHER_VIDEO_METRIC_CATEGORY_KEY && nextActive === false) {
      return NextResponse.json({ error: "其他分类不可停用" }, { status: 400 });
    }

    const category = await prisma.videoMetricCategory.update({
      where: { id: params.id },
      data: {
        name,
        sortOrder,
        isActive: nextActive,
      },
    });

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error("[API ERROR] 更新视频分类失败:", error);

    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "视频分类表未创建，请先执行数据库迁移" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "更新视频分类失败",
        details: error.message,
        code: error.code || "UNKNOWN",
      },
      { status: 500 }
    );
  }
}

// DELETE - 软删除视频分类（停用）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const existing = await prisma.videoMetricCategory.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 });
    }

    if (existing.key === OTHER_VIDEO_METRIC_CATEGORY_KEY) {
      return NextResponse.json({ error: "其他分类不可停用" }, { status: 400 });
    }

    const category = await prisma.videoMetricCategory.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error("[API ERROR] 停用视频分类失败:", error);

    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "视频分类表未创建，请先执行数据库迁移" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "停用视频分类失败",
        details: error.message,
        code: error.code || "UNKNOWN",
      },
      { status: 500 }
    );
  }
}
