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
  adSpend: number;
  cpm: number;
  cpc: number;
  publishedAt: string;
  notes: string;
  createdAt: string;
}

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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">视频</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">平台</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">播放</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">点赞</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">订单</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">营收</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {videos.map((video) => (
                  <tr key={video.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 max-w-xs truncate">{video.title}</div>
                      <div className="text-xs text-gray-500">{new Date(video.publishedAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{video.platform}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatNumber(video.views)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-pink-600">{formatNumber(video.likes)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">{video.orders}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">${video.revenue.toFixed(2)}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">
                {editingVideo ? "编辑视频数据" : "添加视频数据"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
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
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">数据</h3>
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
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">财务数据</h3>
                <div className="grid grid-cols-3 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">完播率(%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={(formData.completionRate * 100).toFixed(1)}
                      onChange={(e) => setFormData({ ...formData, completionRate: parseFloat(e.target.value) / 100 || 0 })}
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
