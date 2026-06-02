import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessPage, canManagePage, getSessionPermissionContext } from "@/lib/pagePermissions";
import { prisma } from "@/lib/prisma";
import {
  getDefaultVideoMetricCategories,
  makeVideoMetricCategoryKey,
  OTHER_VIDEO_METRIC_CATEGORY_KEY,
  sortVideoMetricCategories,
} from "@/lib/videoMetricCategories";

function isMissingTableError(error: any) {
  return error?.code === "P2021";
}

// GET - 获取视频分类列表
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const permissionContext = getSessionPermissionContext(session);
    if (!canAccessPage(permissionContext, "videoMetrics")) {
      return NextResponse.json({ error: "无权限访问视频数据分析" }, { status: 403 });
    }

    try {
      const categories = await prisma.videoMetricCategory.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      return NextResponse.json({ categories });
    } catch (error: any) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ categories: sortVideoMetricCategories(getDefaultVideoMetricCategories()) });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("[API ERROR] 获取视频分类失败:", error);
    return NextResponse.json(
      {
        error: "获取视频分类失败",
        details: error.message,
        code: error.code || "UNKNOWN",
      },
      { status: 500 }
    );
  }
}

// POST - 新增视频分类
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const permissionContext = getSessionPermissionContext(session);
    if (!canManagePage(permissionContext, "videoMetrics")) {
      return NextResponse.json({ error: "无权限操作视频数据分析" }, { status: 403 });
    }

    const data = await request.json();
    const name = (data.name || "").trim();
    const sortOrder = Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0;

    if (!name) {
      return NextResponse.json({ error: "分类名称不能为空" }, { status: 400 });
    }

    const baseKey = makeVideoMetricCategoryKey(data.key || name);
    let candidateKey = baseKey;
    let attempt = 1;

    while (attempt <= 20) {
      const existing = await prisma.videoMetricCategory.findUnique({
        where: { key: candidateKey },
      });

      if (!existing) {
        break;
      }

      candidateKey = `${baseKey}_${attempt}`;
      attempt += 1;
    }

    const category = await prisma.videoMetricCategory.create({
      data: {
        key: candidateKey,
        name,
        sortOrder,
        isActive: true,
      },
    });

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error("[API ERROR] 创建视频分类失败:", error);

    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "视频分类表未创建，请先执行数据库迁移" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "创建视频分类失败",
        details: error.message,
        code: error.code || "UNKNOWN",
      },
      { status: 500 }
    );
  }
}
