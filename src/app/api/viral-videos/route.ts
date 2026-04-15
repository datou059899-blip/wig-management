import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - 获取热门视频列表
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const productSku = searchParams.get("productSku");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {};
    if (platform) where.platform = platform;
    if (productSku) where.productSku = productSku;

    const videos = await prisma.viralVideoAnalysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
      },
    });

    const total = await prisma.viralVideoAnalysis.count({ where });

    return NextResponse.json({ videos, total });
  } catch (error) {
    console.error("获取热门视频列表失败:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

// POST - 创建热门视频分析
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
      viewCount: parseInt(data.viewCount) || 0,
      likeCount: parseInt(data.likeCount) || 0,
      commentCount: parseInt(data.commentCount) || 0,
      shareCount: parseInt(data.shareCount) || 0,
      hookAnalysis: data.hookAnalysis || "",
      sellingPointAnalysis: data.sellingPointAnalysis || "",
      rhythmAnalysis: data.rhythmAnalysis || "",
      visualAnalysis: data.visualAnalysis || "",
      audioAnalysis: data.audioAnalysis || "",
      reusableElements: data.reusableElements || "",
      applicableScenes: data.applicableScenes || "",
      productSku: data.productSku || null,
      tags: data.tags || "",
    };
    
    // 只在有用户ID时设置 createdById
    const userId = (session.user as any).id;
    if (userId) {
      createData.createdById = userId;
    }
    
    const video = await prisma.viralVideoAnalysis.create({
      data: createData,
    });

    return NextResponse.json(video);
  } catch (error: any) {
    console.error("创建热门视频分析失败:", error);
    return NextResponse.json({ 
      error: "创建失败", 
      details: error.message || "未知错误" 
    }, { status: 500 });
  }
}
