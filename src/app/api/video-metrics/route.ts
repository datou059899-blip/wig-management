import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getVideoMetricCategoryLabel,
  normalizeVideoMetricCategory,
  VIDEO_METRIC_CATEGORY_OPTIONS,
} from "@/lib/videoMetricCategories";

type MetricAggregateRow = {
  videoCategory: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  orders: number;
  revenue: number;
  adSpend: number;
  publishedAt: Date;
};

function buildCategorySummary(rows: MetricAggregateRow[]) {
  const grouped = new Map<
    string,
    {
      videoCount: number;
      totalViews: number;
      totalInteractions: number;
      totalClicks: number;
      totalOrders: number;
      totalRevenue: number;
      totalAdSpend: number;
    }
  >();

  for (const row of rows) {
    const videoCategory = normalizeVideoMetricCategory(row.videoCategory);
    const current = grouped.get(videoCategory) ?? {
      videoCount: 0,
      totalViews: 0,
      totalInteractions: 0,
      totalClicks: 0,
      totalOrders: 0,
      totalRevenue: 0,
      totalAdSpend: 0,
    };

    current.videoCount += 1;
    current.totalViews += row.views || 0;
    current.totalInteractions +=
      (row.likes || 0) +
      (row.comments || 0) +
      (row.shares || 0) +
      (row.saves || 0);
    current.totalClicks += row.clicks || 0;
    current.totalOrders += row.orders || 0;
    current.totalRevenue += row.revenue || 0;
    current.totalAdSpend += row.adSpend || 0;

    grouped.set(videoCategory, current);
  }

  return Array.from(grouped.entries())
    .map(([videoCategory, stats]) => ({
      videoCategory,
      label: getVideoMetricCategoryLabel(videoCategory),
      videoCount: stats.videoCount,
      totalViews: stats.totalViews,
      avgViews: stats.videoCount > 0 ? stats.totalViews / stats.videoCount : 0,
      avgEngagementRate: stats.totalViews > 0 ? (stats.totalInteractions / stats.totalViews) * 100 : 0,
      avgClickRate: stats.totalViews > 0 ? (stats.totalClicks / stats.totalViews) * 100 : 0,
      totalOrders: stats.totalOrders,
      totalRevenue: stats.totalRevenue,
      totalAdSpend: stats.totalAdSpend,
      roas: stats.totalAdSpend > 0 ? stats.totalRevenue / stats.totalAdSpend : 0,
    }))
    .sort((a, b) => {
      const aIndex = VIDEO_METRIC_CATEGORY_OPTIONS.findIndex((option) => option.value === a.videoCategory);
      const bIndex = VIDEO_METRIC_CATEGORY_OPTIONS.findIndex((option) => option.value === b.videoCategory);
      return aIndex - bIndex;
    });
}

function buildCategoryTrend(rows: MetricAggregateRow[]) {
  const grouped = new Map<
    string,
    {
      date: string;
      videoCategory: string;
      views: number;
      orders: number;
      revenue: number;
      adSpend: number;
    }
  >();

  for (const row of rows) {
    const date = row.publishedAt.toISOString().split("T")[0];
    const videoCategory = normalizeVideoMetricCategory(row.videoCategory);
    const key = `${date}:${videoCategory}`;
    const current = grouped.get(key) ?? {
      date,
      videoCategory,
      views: 0,
      orders: 0,
      revenue: 0,
      adSpend: 0,
    };

    current.views += row.views || 0;
    current.orders += row.orders || 0;
    current.revenue += row.revenue || 0;
    current.adSpend += row.adSpend || 0;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      label: getVideoMetricCategoryLabel(item.videoCategory),
    }))
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      const aIndex = VIDEO_METRIC_CATEGORY_OPTIONS.findIndex((option) => option.value === a.videoCategory);
      const bIndex = VIDEO_METRIC_CATEGORY_OPTIONS.findIndex((option) => option.value === b.videoCategory);
      return aIndex - bIndex;
    });
}

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
    const videoCategoryParam = searchParams.get("videoCategory");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {};
    if (platform) where.platform = platform;
    if (productSku) where.productSku = productSku;
    if (contentType) where.contentType = contentType;
    if (videoCategoryParam && videoCategoryParam !== "all") {
      where.videoCategory = normalizeVideoMetricCategory(videoCategoryParam);
    }
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
    const [summary, metricsForCategory] = await Promise.all([
      prisma.ownVideoMetric.aggregate({
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
      }),
      prisma.ownVideoMetric.findMany({
        where,
        select: {
          videoCategory: true,
          publishedAt: true,
          views: true,
          likes: true,
          comments: true,
          shares: true,
          saves: true,
          clicks: true,
          orders: true,
          revenue: true,
          adSpend: true,
        },
        orderBy: { publishedAt: "asc" },
      }),
    ]);

    const normalizedVideos = videos.map((video) => ({
      ...video,
      videoCategory: normalizeVideoMetricCategory((video as any).videoCategory),
    }));

    const categoryRows: MetricAggregateRow[] = metricsForCategory.map((row) => ({
      videoCategory: normalizeVideoMetricCategory(row.videoCategory),
      publishedAt: row.publishedAt,
      views: row.views || 0,
      likes: row.likes || 0,
      comments: row.comments || 0,
      shares: row.shares || 0,
      saves: row.saves || 0,
      clicks: row.clicks || 0,
      orders: row.orders || 0,
      revenue: row.revenue || 0,
      adSpend: row.adSpend || 0,
    }));

    return NextResponse.json({
      videos: normalizedVideos,
      total,
      summary,
      categorySummary: buildCategorySummary(categoryRows),
      categoryTrend: buildCategoryTrend(categoryRows),
    });
  } catch (error: any) {
    console.error("[API ERROR] 获取视频数据列表失败:", error);
    return NextResponse.json({ 
      error: "获取失败", 
      details: error.message,
      code: error.code || "UNKNOWN"
    }, { status: 500 });
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
    
    if (!data.title) {
      return NextResponse.json({ error: "视频标题不能为空" }, { status: 400 });
    }
    
    // 校验百分比范围
    const completionRate = parseFloat(data.completionRate) || 0;
    const retention3s = parseFloat(data.retention3s) || 0;
    const retention5s = parseFloat(data.retention5s) || 0;
    
    if (completionRate < 0 || completionRate > 1) {
      return NextResponse.json({ error: "完播率必须在 0-100% 之间" }, { status: 400 });
    }
    if (retention3s < 0 || retention3s > 1) {
      return NextResponse.json({ error: "3秒留存率必须在 0-100% 之间" }, { status: 400 });
    }
    if (retention5s < 0 || retention5s > 1) {
      return NextResponse.json({ error: "5秒留存率必须在 0-100% 之间" }, { status: 400 });
    }
    
    // 校验平均观看时长
    const avgWatchTime = parseFloat(data.avgWatchTime) || 0;
    if (avgWatchTime < 0) {
      return NextResponse.json({ error: "平均观看时长不能为负数" }, { status: 400 });
    }
    
    const createData: any = {
      title: data.title,
      platform: data.platform || "TikTok",
      sourceUrl: data.sourceUrl || null,
      videoDuration: parseInt(data.videoDuration) || 0,
      contentType: data.contentType || "product_showcase",
      videoCategory: normalizeVideoMetricCategory(data.videoCategory),
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
      completionRate,
      avgWatchTime,
      retention3s,
      retention5s,
      dropOffSecond: data.dropOffSecond ? parseInt(data.dropOffSecond) : null,
      adSpend: parseFloat(data.adSpend) || 0,
      cpm: parseFloat(data.cpm) || 0,
      cpc: parseFloat(data.cpc) || 0,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
      notes: data.notes || "",
    };
    
    const userId = (session.user as any).id;
    if (userId) {
      createData.createdById = userId;
    }
    
    console.log("[API] Creating video metric:", JSON.stringify(createData, null, 2));
    
    const video = await prisma.ownVideoMetric.create({ data: createData });
    return NextResponse.json(video);
  } catch (error: any) {
    console.error("[API ERROR] 创建视频数据失败:", error);
    
    let errorMessage = "创建失败";
    let errorDetails = error.message || "未知错误";
    
    if (error.code === "P2021") {
      errorMessage = "数据库表不存在";
      errorDetails = "OwnVideoMetric 表未创建，请执行数据库迁移";
    } else if (error.code === "P2003") {
      errorMessage = "外键约束失败";
    } else if (error.code === "P2002") {
      errorMessage = "数据重复";
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails,
      code: error.code || "UNKNOWN"
    }, { status: 500 });
  }
}
