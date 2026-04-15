"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";

interface VideoMetric {
  id: string;
  title: string;
  platform: string;
  sourceUrl?: string;
  videoDuration: number;
  contentType: string;
  productSku?: string;
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  addToCarts: number;
  orders: number;
  revenue: number;
  completionRate: number;
  avgWatchTime: number;
  retention3s: number;
  retention5s: number;
  dropOffSecond?: number;
  adSpend: number;
  cpm: number;
  cpc: number;
  publishedAt: string;
  notes: string;
  createdAt: string;
}

// 自动计算指标
const calculateMetrics = (video: VideoMetric) => {
  const views = video.views || 0;
  const likes = video.likes || 0;
  const comments = video.comments || 0;
  const shares = video.shares || 0;
  const saves = video.saves || 0;
  const clicks = video.clicks || 0;
  const orders = video.orders || 0;
  const revenue = video.revenue || 0;
  const adSpend = video.adSpend || 0;

  // 互动率 = (点赞 + 评论 + 分享 + 收藏) / 播放量
  const engagementRate = views > 0 ? ((likes + comments + shares + saves) / views) * 100 : 0;
  
  // 点击率 = 点击 / 播放量
  const ctr = views > 0 ? (clicks / views) * 100 : 0;
  
  // 加购率 = 加购 / 点击
  const addToCartRate = clicks > 0 ? (video.addToCarts / clicks) * 100 : 0;
  
  // 下单率 = 订单 / 点击
  const orderRate = clicks > 0 ? (orders / clicks) * 100 : 0;
  
  // 成交转化率 = 订单 / 播放量
  const conversionRate = views > 0 ? (orders / views) * 100 : 0;
  
  // ROAS = 营收 / 广告花费
  const roas = adSpend > 0 ? revenue / adSpend : 0;

  return {
    engagementRate,
    ctr,
    addToCartRate,
    orderRate,
    conversionRate,
    roas,
  };
};

// 获取运营标签
const getPerformanceTag = (video: VideoMetric) => {
  const { engagementRate, ctr, conversionRate, roas } = calculateMetrics(video);
  
  if (video.views > 10000 && conversionRate < 0.5) {
    return { label: "高播低转", color: "bg-yellow-100 text-yellow-800" };
  }
  if (engagementRate > 5 && video.orders < 5) {
    return { label: "高互动低成交", color: "bg-blue-100 text-blue-800" };
  }
  if (video.views < 1000 && video.orders > 5) {
    return { label: "低播高转", color: "bg-green-100 text-green-800" };
  }
  if (roas > 3) {
    return { label: "优质", color: "bg-purple-100 text-purple-800" };
  }
  return null;
};

export default function VideoMetricsPage() {
  const [videos, setVideos] = useState<VideoMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoMetric | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    title: "",
    platform: "TikTok",
    sourceUrl: "",
    videoDuration: 0,
    contentType: "product_showcase",
    productSku: "",
    impressions: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    addToCarts: 0,
    orders: 0,
    revenue: 0,
    completionRate: 0,
    avgWatchTime: 0,
    retention3s: 0,
    retention5s: 0,
    dropOffSecond: 0,
    adSpend: 0,
    cpm: 0,
    cpc: 0,
    publishedAt: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await fetch("/api/video-metrics");
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (error) {
      console.error("获取视频数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    
    try {
      const url = editingVideo
        ? `/api/video-metrics/${editingVideo.id}`
        : "/api/video-metrics";
      const method = editingVideo ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          publishedAt: new Date(formData.publishedAt).toISOString(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowModal(false);
        setEditingVideo(null);
        resetForm();
        fetchVideos();
      } else {
        setError(data.error || data.details || "保存失败，请重试");
      }
    } catch (err: any) {
      setError(err.message || "网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条视频数据吗？")) return;
    try {
      const res = await fetch(`/api/video-metrics/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const handleEdit = (video: VideoMetric) => {
    setEditingVideo(video);
    setFormData({
      title: video.title,
      platform: video.platform,
      sourceUrl: video.sourceUrl || "",
      videoDuration: video.videoDuration,
      contentType: video.contentType,
      productSku: video.productSku || "",
      impressions: video.impressions,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      saves: video.saves,
      clicks: video.clicks,
      addToCarts: video.addToCarts,
      orders: video.orders,
      revenue: video.revenue,
      completionRate: video.completionRate,
      avgWatchTime: video.avgWatchTime,
      retention3s: video.retention3s || 0,
      retention5s: video.retention5s || 0,
      dropOffSecond: video.dropOffSecond || 0,
      adSpend: video.adSpend,
      cpm: video.cpm,
      cpc: video.cpc,
      publishedAt: video.publishedAt.split("T")[0],
      notes: video.notes,
    });
    setShowModal(true);
    setError("");
  };

  const resetForm = () => {
    setFormData({
      title: "",
      platform: "TikTok",
      sourceUrl: "",
      videoDuration: 0,
      contentType: "product_showcase",
      productSku: "",
      impressions: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: 0,
      addToCarts: 0,
      orders: 0,
      revenue: 0,
      completionRate: 0,
      avgWatchTime: 0,
      retention3s: 0,
      retention5s: 0,
      dropOffSecond: 0,
      adSpend: 0,
      cpm: 0,
      cpc: 0,
      publishedAt: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setError("");
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatPercent = (num: number) => {
    return num.toFixed(1) + "%";
  };

  // 计算汇总数据
  const summary = videos.reduce((acc, video) => ({
    totalVideos: acc.totalVideos + 1,
    totalViews: acc.totalViews + (video.views || 0),
    totalOrders: acc.totalOrders + (video.orders || 0),
    totalRevenue: acc.totalRevenue + (video.revenue || 0),
  }), { totalVideos: 0, totalViews: 0, totalOrders: 0, totalRevenue: 0 });

  return (
    <div className="p-6">
      <PageHeader
        title="视频数据分析"
        description="追踪和分析自发短视频的表现数据"
        actions={
          <button
            onClick={() => {
              setEditingVideo(null);
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 添加数据
          </button>
        }
      />

      {/* 统计卡片 */}
      {!loading && videos.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">总视频数</div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalVideos}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">总播放量</div>
            <div className="text-2xl font-bold text-blue-600">{formatNumber(summary.totalViews)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">总订单</div>
            <div className="text-2xl font-bold text-green-600">{summary.totalOrders}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500">总营收</div>
            <div className="text-2xl font-bold text-purple-600">${summary.totalRevenue.toFixed(2)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          title="暂无视频数据"
          description="点击上方按钮添加第一条视频数据"
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">视频</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">平台</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">播放</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">3秒留存</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">完播率</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">互动率</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">点击率</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">订单</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">营收</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ROAS</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">标签</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {videos.map((video) => {
                  const metrics = calculateMetrics(video);
                  const tag = getPerformanceTag(video);
                  return (
                    <tr key={video.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 max-w-xs truncate">{video.title}</div>
                        <div className="text-xs text-gray-500">{new Date(video.publishedAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{video.platform}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">{formatNumber(video.views)}</td>
                      <td className="px-4 py-3 text-right text-sm">{video.retention3s ? formatPercent(video.retention3s * 100) : "-"}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatPercent(video.completionRate * 100)}</td>
                      <td className="px-4 py-3 text-right text-sm text-pink-600">{formatPercent(metrics.engagementRate)}</td>
                      <td className="px-4 py-3 text-right text-sm text-blue-600">{formatPercent(metrics.ctr)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-green-600">{video.orders}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">${video.revenue.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">{metrics.roas > 0 ? metrics.roas.toFixed(2) : "-"}</td>
                      <td className="px-4 py-3 text-center">
                        {tag && (
                          <span className={`px-2 py-1 text-xs rounded-full ${tag.color}`}>
                            {tag.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleEdit(video)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(video.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">
                {editingVideo ? "编辑视频数据" : "添加视频数据"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* 基础信息 */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-blue-500 rounded"></span>
                  基础信息
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      视频标题 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">平台</label>
                    <select
                      value={formData.platform}
                      onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="TikTok">TikTok</option>
                      <option value="抖音">抖音</option>
                      <option value="Instagram">Instagram</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">发布日期</label>
                    <input
                      type="date"
                      value={formData.publishedAt}
                      onChange={(e) => setFormData({ ...formData, publishedAt: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">视频时长（秒）</label>
                    <input
                      type="number"
                      value={formData.videoDuration}
                      onChange={(e) => setFormData({ ...formData, videoDuration: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">视频链接</label>
                    <input
                      type="url"
                      value={formData.sourceUrl}
                      onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              {/* 留存数据 */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-green-500 rounded"></span>
                  留存数据
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">平均观看时长（秒）</label>
                    <input
                      type="number"
                      value={formData.avgWatchTime}
                      onChange={(e) => setFormData({ ...formData, avgWatchTime: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">3秒留存率（%）</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.retention3s ? (formData.retention3s * 100).toFixed(1) : "0"}
                      onChange={(e) => setFormData({ ...formData, retention3s: parseFloat(e.target.value) / 100 || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">5秒留存率（%）</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.retention5s ? (formData.retention5s * 100).toFixed(1) : "0"}
                      onChange={(e) => setFormData({ ...formData, retention5s: parseFloat(e.target.value) / 100 || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">完播率（%）</label>
                    <input
                      type="number"
                      step="0.1"
                      value={(formData.completionRate * 100).toFixed(1)}
                      onChange={(e) => setFormData({ ...formData, completionRate: parseFloat(e.target.value) / 100 || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">流失高峰秒点</label>
                    <input
                      type="number"
                      value={formData.dropOffSecond || ""}
                      onChange={(e) => setFormData({ ...formData, dropOffSecond: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="第几秒"
                    />
                  </div>
                </div>
              </div>

              {/* 互动数据 */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-pink-500 rounded"></span>
                  互动数据
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">播放量</label>
                    <input
                      type="number"
                      value={formData.views}
                      onChange={(e) => setFormData({ ...formData, views: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">点赞</label>
                    <input
                      type="number"
                      value={formData.likes}
                      onChange={(e) => setFormData({ ...formData, likes: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">评论</label>
                    <input
                      type="number"
                      value={formData.comments}
                      onChange={(e) => setFormData({ ...formData, comments: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">分享</label>
                    <input
                      type="number"
                      value={formData.shares}
                      onChange={(e) => setFormData({ ...formData, shares: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">收藏</label>
                    <input
                      type="number"
                      value={formData.saves}
                      onChange={(e) => setFormData({ ...formData, saves: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* 转化数据 */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-purple-500 rounded"></span>
                  转化数据
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">点击</label>
                    <input
                      type="number"
                      value={formData.clicks}
                      onChange={(e) => setFormData({ ...formData, clicks: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">加购</label>
                    <input
                      type="number"
                      value={formData.addToCarts}
                      onChange={(e) => setFormData({ ...formData, addToCarts: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">订单</label>
                    <input
                      type="number"
                      value={formData.orders}
                      onChange={(e) => setFormData({ ...formData, orders: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">营收($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.revenue}
                      onChange={(e) => setFormData({ ...formData, revenue: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">广告花费($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.adSpend}
                      onChange={(e) => setFormData({ ...formData, adSpend: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  {editingVideo ? "保存" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
