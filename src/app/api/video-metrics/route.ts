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
    
    // 确保必填字段存在
    if (!data.title) {
      return NextResponse.json({ error: "视频标题不能为空" }, { status: 400 });
    }
    
    // 构建创建数据对象
    const createData: any = {
      title: data.title,
      platform: data.platform || "TikTok",
      sourceUrl: data.sourceUrl || null,
      videoDuration: parseInt(data.videoDuration) || 0,
      contentType: data.contentType || "product_showcase",
      productSku: data.productSku || null,
      impressions: parseInt(data.impressions) || 0,
      views: parseInt(data.views) || 0,
      likes: parseInt(data.likes) || 0,
      comments: parseInt(data.comments) || 0,
      shares: parseInt(data.shares) || 0,
      saves: parseInt(data.saves) || 0,
      clicks: parseInt(data.clicks) || 0,
      addToCarts: parseInt(data.addToCarts) || 0,
      orders: parseInt(data.orders) || 0,
      revenue: parseFloat(data.revenue) || 0,
      completionRate: parseFloat(data.completionRate) || 0,
      avgWatchTime: parseInt(data.avgWatchTime) || 0,
      adSpend: parseFloat(data.adSpend) || 0,
      cpm: parseFloat(data.cpm) || 0,
      cpc: parseFloat(data.cpc) || 0,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
      notes: data.notes || "",
    };
    
    // 只在有用户ID时设置 createdById
    const userId = (session.user as any).id;
    if (userId) {
      createData.createdById = userId;
    }
    
    const video = await prisma.ownVideoMetric.create({
      data: createData,
    });

    return NextResponse.json(video);
  } catch (error: any) {
    console.error("创建视频数据失败:", error);
    return NextResponse.json({ 
      error: "创建失败", 
      details: error.message || "未知错误" 
    }, { status: 500 });
  }
}
