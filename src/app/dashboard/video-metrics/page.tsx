"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart,
  Scatter,
} from "recharts";

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

interface SummaryData {
  _sum: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    addToCarts: number;
    orders: number;
    revenue: number;
    adSpend: number;
  };
  _avg: {
    completionRate: number;
    cpm: number;
    cpc: number;
  };
}

const COLORS = ["#3B82F6", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];

const contentTypeMap: Record<string, string> = {
  product_showcase: "产品展示",
  tutorial: "教程",
  scene: "场景",
  other: "其他",
};

export default function VideoMetricsPage() {
  const [videos, setVideos] = useState<VideoMetric[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoMetric | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "charts">("list");
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
      setSummary(data.summary || null);
    } catch (error) {
      console.error("获取视频数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      if (res.ok) {
        setShowModal(false);
        setEditingVideo(null);
        resetForm();
        fetchVideos();
      }
    } catch (error) {
      console.error("保存失败:", error);
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
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatCurrency = (num: number) => {
    return "$" + num.toFixed(2);
  };

  // 准备图表数据
  const funnelData = summary
    ? [
        { name: "曝光", value: summary._sum.views || 0, color: "#3B82F6" },
        { name: "点击", value: summary._sum.clicks || 0, color: "#8B5CF6" },
        { name: "加购", value: summary._sum.addToCarts || 0, color: "#F59E0B" },
        { name: "成交", value: summary._sum.orders || 0, color: "#10B981" },
      ]
    : [];

  const trendData = videos
    .slice(0, 10)
    .map((v) => ({
      name: v.title.slice(0, 10) + "...",
      播放量: v.views,
      点赞: v.likes,
      评论: v.comments,
      转化: v.orders,
    }))
    .reverse();

  const radarData = summary
    ? [
        { subject: "完播率", A: (summary._avg.completionRate || 0) * 100, fullMark: 100 },
        { subject: "互动率", A: ((summary._sum.likes || 0) / (summary._sum.views || 1)) * 100, fullMark: 100 },
        { subject: "点击率", A: ((summary._sum.clicks || 0) / (summary._sum.views || 1)) * 100, fullMark: 100 },
        { subject: "加购率", A: ((summary._sum.addToCarts || 0) / (summary._sum.clicks || 1)) * 100, fullMark: 100 },
        { subject: "转化率", A: ((summary._sum.orders || 0) / (summary._sum.clicks || 1)) * 100, fullMark: 100 },
      ]
    : [];

  const scatterData = videos.map((v) => ({
    x: v.views,
    y: v.orders,
    z: v.revenue,
    name: v.title.slice(0, 15),
  }));

  const contentTypeData = videos.reduce((acc, v) => {
    const type = contentTypeMap[v.contentType] || v.contentType;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(contentTypeData).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6">
      <PageHeader
        title="视频数据分析"
        description="追踪和分析自发短视频的表现数据"
        actions={
          <div className="flex gap-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab("list")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "list"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                列表
              </button>
              <button
                onClick={() => setActiveTab("charts")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "charts"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                图表
              </button>
            </div>
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
          </div>
        }
      />

      {/* 汇总卡片 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">总播放量</div>
            <div className="text-xl font-bold text-gray-900">{formatNumber(summary._sum.views || 0)}</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">总点赞</div>
            <div className="text-xl font-bold text-pink-600">{formatNumber(summary._sum.likes || 0)}</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">总订单</div>
            <div className="text-xl font-bold text-green-600">{formatNumber(summary._sum.orders || 0)}</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">总营收</div>
            <div className="text-xl font-bold text-blue-600">{formatCurrency(summary._sum.revenue || 0)}</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">平均完播率</div>
            <div className="text-xl font-bold text-purple-600">
              {((summary._avg.completionRate || 0) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-500">平均CPM</div>
            <div className="text-xl font-bold text-orange-600">
              {formatCurrency(summary._avg.cpm || 0)}
            </div>
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
      ) : activeTab === "list" ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">视频</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">平台</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">播放</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">点赞</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">点击</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">订单</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">营收</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">完播率</th>
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
                    <td className="px-4 py-3 text-sm text-gray-600">{contentTypeMap[video.contentType] || video.contentType}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatNumber(video.views)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-pink-600">{formatNumber(video.likes)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatNumber(video.clicks)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">{video.orders}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(video.revenue)}</td>
                    <td className="px-4 py-3 text-center text-sm">{(video.completionRate * 100).toFixed(1)}%</td>
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 转化漏斗 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">转化漏斗</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={60} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 趋势对比 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">最近10条视频趋势</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-45} textAnchor="end" height={80} />
                <YAxis tickFormatter={(v) => formatNumber(v)} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Legend />
                <Line type="monotone" dataKey="播放量" stroke="#3B82F6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="点赞" stroke="#EC4899" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="转化" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 内容类型分布 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">内容类型分布</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 综合表现雷达图 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">综合表现雷达</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar
                  name="平均表现"
                  dataKey="A"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.3}
                />
                <Tooltip formatter={(value: number) => value.toFixed(1) + "%"} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 播放vs转化散点图 */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">播放量 vs 转化率分析</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="播放量"
                  tickFormatter={(v) => formatNumber(v)}
                  label={{ value: "播放量", position: "bottom" }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="订单数"
                  label={{ value: "订单数", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  formatter={(value: number, name: string) => {
                    if (name === "播放量") return formatNumber(value);
                    return value;
                  }}
                  labelFormatter={(label: string, payload: any) => {
                    return payload?.[0]?.payload?.name || label;
                  }}
                />
                <Scatter data={scatterData} fill="#3B82F6" />
              </ScatterChart>
            </ResponsiveContainer>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">视频标题</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">内容类型</label>
                  <select
                    value={formData.contentType}
                    onChange={(e) => setFormData({ ...formData, contentType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="product_showcase">产品展示</option>
                    <option value="tutorial">教程</option>
                    <option value="scene">场景</option>
                    <option value="other">其他</option>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">产品SKU</label>
                  <input
                    type="text"
                    value={formData.productSku}
                    onChange={(e) => setFormData({ ...formData, productSku: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">曝光与互动</h3>
                <div className="grid grid-cols-3 gap-4">
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

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">转化数据</h3>
                <div className="grid grid-cols-3 gap-4">
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
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">投放成本</h3>
                <div className="grid grid-cols-3 gap-4">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPM($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.cpm}
                      onChange={(e) => setFormData({ ...formData, cpm: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPC($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.cpc}
                      onChange={(e) => setFormData({ ...formData, cpc: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
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
