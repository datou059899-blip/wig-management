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
    
    // 转换数字字段
    const updateData: any = {
      title: data.title,
      platform: data.platform,
      sourceUrl: data.sourceUrl || null,
      videoDuration: parseInt(data.videoDuration) || 0,
      contentType: data.contentType,
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
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      notes: data.notes || "",
    };
    
    const video = await prisma.ownVideoMetric.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(video);
  } catch (error: any) {
    console.error("[API ERROR] 更新视频数据失败:", error);
    
    let errorMessage = "更新失败";
    let errorDetails = error.message || "未知错误";
    
    if (error.code === "P2025") {
      errorMessage = "视频不存在";
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails,
      code: error.code || "UNKNOWN"
    }, { status: 500 });
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
