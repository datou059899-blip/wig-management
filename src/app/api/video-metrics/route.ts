import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - 获取视频数据列表
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const productSku = searchParams.get("productSku");
    const contentType = searchParams.get("contentType");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {};
    if (platform) where.platform = platform;
    if (productSku) where.productSku = productSku;
    if (contentType) where.contentType = contentType;
    if (startDate || endDate) {
      where.publishedAt = {};
      if (startDate) where.publishedAt.gte = new Date(startDate);
      if (endDate) where.publishedAt.lte = new Date(endDate);
    }

    const videos = await prisma.ownVideoMetric.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
      },
    });

    const total = await prisma.ownVideoMetric.count({ where });

    // 计算汇总数据
    const summary = await prisma.ownVideoMetric.aggregate({
      where,
      _sum: {
        views: true,
        likes: true,
        comments: true,
        shares: true,
        clicks: true,
        addToCarts: true,
        orders: true,
        revenue: true,
        adSpend: true,
      },
      _avg: {
        completionRate: true,
        cpm: true,
        cpc: true,
      },
    });

    return NextResponse.json({ videos, total, summary });
  } catch (error) {
    console.error("获取视频数据列表失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

// POST - 创建视频数据
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const data = await request.json();
    
    const video = await prisma.ownVideoMetric.create({
      data: {
        ...data,
        createdById: (session.user as any).id,
      },
    });

    return NextResponse.json(video);
  } catch (error) {
    console.error("创建视频数据失败:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
