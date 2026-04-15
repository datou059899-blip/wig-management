"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";

interface ViralVideo {
  id: string;
  title: string;
  platform: string;
  sourceUrl?: string;
  videoDuration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  hookAnalysis: string;
  sellingPointAnalysis: string;
  rhythmAnalysis: string;
  visualAnalysis: string;
  audioAnalysis: string;
  reusableElements: string;
  applicableScenes: string;
  productSku?: string;
  tags: string;
  createdAt: string;
  createdBy?: {
    name?: string;
    email?: string;
  };
}

export default function ViralVideosPage() {
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<ViralVideo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    title: "",
    platform: "TikTok",
    sourceUrl: "",
    videoDuration: 0,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    hookAnalysis: "",
    sellingPointAnalysis: "",
    rhythmAnalysis: "",
    visualAnalysis: "",
    audioAnalysis: "",
    reusableElements: "",
    applicableScenes: "",
    productSku: "",
    tags: "",
  });

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await fetch("/api/viral-videos");
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (error) {
      console.error("获取视频列表失败:", error);
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
        ? `/api/viral-videos/${editingVideo.id}` 
        : "/api/viral-videos";
      const method = editingVideo ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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
    if (!confirm("确定要删除这个视频分析吗？")) return;
    try {
      const res = await fetch(`/api/viral-videos/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchVideos();
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const handleEdit = (video: ViralVideo) => {
    setEditingVideo(video);
    setFormData({
      title: video.title,
      platform: video.platform,
      sourceUrl: video.sourceUrl || "",
      videoDuration: video.videoDuration,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      shareCount: video.shareCount,
      hookAnalysis: video.hookAnalysis,
      sellingPointAnalysis: video.sellingPointAnalysis,
      rhythmAnalysis: video.rhythmAnalysis,
      visualAnalysis: video.visualAnalysis,
      audioAnalysis: video.audioAnalysis,
      reusableElements: video.reusableElements,
      applicableScenes: video.applicableScenes,
      productSku: video.productSku || "",
      tags: video.tags,
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
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      hookAnalysis: "",
      sellingPointAnalysis: "",
      rhythmAnalysis: "",
      visualAnalysis: "",
      audioAnalysis: "",
      reusableElements: "",
      applicableScenes: "",
      productSku: "",
      tags: "",
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
        title="热门视频拆解"
        description="分析爆款视频的内容结构和成功要素"
        actions={
          <button
            onClick={() => {
              setEditingVideo(null);
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 添加视频分析
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : videos.length === 0 ? (
        <EmptyState
          title="暂无视频分析"
          description="点击上方按钮添加第一个热门视频拆解"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
          {videos.map((video) => (
            <div
              key={video.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 line-clamp-2 flex-1">
                    {video.title}
                  </h3>
                  <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {video.platform}
                  </span>
                </div>

                {video.sourceUrl && (
                  <a
                    href={video.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline mb-3 block truncate"
                  >
                    {video.sourceUrl}
                  </a>
                )}

                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">
                      {formatNumber(video.viewCount)}
                    </div>
                    <div className="text-xs text-gray-500">播放</div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-pink-600">
                      {formatNumber(video.likeCount)}
                    </div>
                    <div className="text-xs text-gray-500">点赞</div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-blue-600">
                      {formatNumber(video.commentCount)}
                    </div>
                    <div className="text-xs text-gray-500">评论</div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">
                      {formatNumber(video.shareCount)}
                    </div>
                    <div className="text-xs text-gray-500">分享</div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {video.hookAnalysis && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 shrink-0">钩子:</span>
                      <span className="text-gray-700 line-clamp-2">{video.hookAnalysis}</span>
                    </div>
                  )}
                  {video.sellingPointAnalysis && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 shrink-0">卖点:</span>
                      <span className="text-gray-700 line-clamp-2">{video.sellingPointAnalysis}</span>
                    </div>
                  )}
                  {video.reusableElements && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 shrink-0">可复用:</span>
                      <span className="text-gray-700 line-clamp-1">{video.reusableElements}</span>
                    </div>
                  )}
                </div>

                {video.tags && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {video.tags.split(",").map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(video)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(video.id)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">
                {editingVideo ? "编辑视频分析" : "添加视频分析"}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    平台
                  </label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="TikTok">TikTok</option>
                    <option value="抖音">抖音</option>
                    <option value="Instagram">Instagram</option>
                    <option value="YouTube">YouTube</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    视频链接
                  </label>
                  <input
                    type="url"
                    value={formData.sourceUrl}
                    onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    视频时长(秒)
                  </label>
                  <input
                    type="number"
                    value={formData.videoDuration}
                    onChange={(e) => setFormData({ ...formData, videoDuration: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    播放量
                  </label>
                  <input
                    type="number"
                    value={formData.viewCount}
                    onChange={(e) => setFormData({ ...formData, viewCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    点赞数
                  </label>
                  <input
                    type="number"
                    value={formData.likeCount}
                    onChange={(e) => setFormData({ ...formData, likeCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    评论数
                  </label>
                  <input
                    type="number"
                    value={formData.commentCount}
                    onChange={(e) => setFormData({ ...formData, commentCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分享数
                  </label>
                  <input
                    type="number"
                    value={formData.shareCount}
                    onChange={(e) => setFormData({ ...formData, shareCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">内容拆解</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      前3秒钩子分析
                    </label>
                    <textarea
                      value={formData.hookAnalysis}
                      onChange={(e) => setFormData({ ...formData, hookAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析视频开头如何吸引用户..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      卖点呈现分析
                    </label>
                    <textarea
                      value={formData.sellingPointAnalysis}
                      onChange={(e) => setFormData({ ...formData, sellingPointAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析产品卖点如何展示..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      节奏结构分析
                    </label>
                    <textarea
                      value={formData.rhythmAnalysis}
                      onChange={(e) => setFormData({ ...formData, rhythmAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析视频节奏和段落分布..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      视觉呈现分析
                    </label>
                    <textarea
                      value={formData.visualAnalysis}
                      onChange={(e) => setFormData({ ...formData, visualAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析镜头、画面、字幕等..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      音频分析
                    </label>
                    <textarea
                      value={formData.audioAnalysis}
                      onChange={(e) => setFormData({ ...formData, audioAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析BGM、配音、音效等..."
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">可复用元素</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      可复用元素
                    </label>
                    <input
                      type="text"
                      value={formData.reusableElements}
                      onChange={(e) => setFormData({ ...formData, reusableElements: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="如：开场话术、转场技巧、BGM等"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      适用场景
                    </label>
                    <input
                      type="text"
                      value={formData.applicableScenes}
                      onChange={(e) => setFormData({ ...formData, applicableScenes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="如：新品推广、促销活动等"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      关联产品SKU
                    </label>
                    <input
                      type="text"
                      value={formData.productSku}
                      onChange={(e) => setFormData({ ...formData, productSku: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      标签(用逗号分隔)
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="假发,教程,爆款..."
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
