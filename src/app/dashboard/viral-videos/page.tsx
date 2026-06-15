"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";

type TabKey = "cases" | "recommended" | "mistakes" | "methods";

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
  updatedAt: string;
  createdBy?: {
    name?: string;
    email?: string;
  };
  updatedBy?: {
    name?: string;
    email?: string;
  };
}

type ScriptSummary = {
  id: string;
  title: string;
  platform?: string | null;
  productSku?: string | null;
  sourceUrl?: string | null;
  status: string;
  updatedAt: string;
  tags?: string | null;
  breakdowns?: Array<{
    id: string;
    version: number;
    content?: string | null;
    updatedAt: string;
  }>;
  standardAnalysis?: {
    id: string;
    commonMistakes?: string | null;
    whyItWorked?: string | null;
    whatToWatch?: string | null;
    todayExecution?: string | null;
    updatedAt: string;
  } | null;
  updateLogs?: Array<{
    id: string;
    summary: string;
    impactScope?: string | null;
    impactArea?: string | null;
    createdAt: string;
  }>;
};

type MistakeItem = {
  text: string;
  count: number;
  sources: string[];
};

type MethodItem = {
  id: string;
  title: string;
  body: string;
  sourceTitle: string;
  updatedAt: string;
  kind: string;
};

type RecommendedVideo = {
  video: ViralVideo;
  score: number;
  reason: string;
};

type BreakdownSections = Record<string, string>;

const TAB_OPTIONS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: "cases", label: "案例库", description: "保留原热门视频拆解内容，持续沉淀爆款案例。" },
  { key: "recommended", label: "推荐学习", description: "自动读取最近高表现、值得优先学习的案例。" },
  { key: "mistakes", label: "错误案例", description: "聚合 scripts 体系里已有的常见错误和翻车点。" },
  { key: "methods", label: "方法库", description: "读取 scripts 体系已有 SOP、拆解方法和最近方法更新。" },
];

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN");
};

const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const getUserDisplayName = (user?: { name?: string; email?: string }) => {
  if (!user) return "未知";
  return user.name || user.email?.split("@")[0] || "未知";
};

const toPlainText = (value?: string | null) => String(value || "").trim();

const parseBreakdownSections = (content?: string | null): BreakdownSections => {
  const text = toPlainText(content);
  if (!text) return {};

  const result: BreakdownSections = {};
  const regex = /^##\s+(.+?)\s*$/gm;
  const matches: Array<{ title: string; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  if (matches.length === 0) return result;

  matches.forEach((item, index) => {
    const start = text.indexOf("\n", item.index);
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const body = text.slice(start + 1, end).trim();
    if (body) {
      result[item.title] = body;
    }
  });

  return result;
};

const extractBulletLines = (...sources: Array<string | null | undefined>) =>
  sources
    .flatMap((source) =>
      String(source || "")
        .split("\n")
        .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
        .filter(Boolean)
    );

const pickSection = (sections: BreakdownSections, keywords: string[]) => {
  const entry = Object.entries(sections).find(([title]) =>
    keywords.some((keyword) => title.includes(keyword))
  );
  return entry?.[1] || "";
};

const buildRecommendedVideos = (videos: ViralVideo[]): RecommendedVideo[] =>
  videos
    .map((video) => {
      const engagement = video.likeCount + video.commentCount * 3 + video.shareCount * 5;
      const freshness = Math.max(
        0,
        30 - Math.floor((Date.now() - new Date(video.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      );
      const score = video.viewCount + engagement * 20 + freshness * 1000;
      const reasonParts = [
        `${formatNumber(video.viewCount)} 播放`,
        `${formatNumber(video.likeCount + video.commentCount + video.shareCount)} 互动`,
      ];
      if (freshness > 0) {
        reasonParts.push(`最近 ${Math.min(freshness, 30)} 天仍有表现`);
      }
      return {
        video,
        score,
        reason: reasonParts.join(" · "),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

const buildMistakeItems = (scripts: ScriptSummary[]): MistakeItem[] => {
  const mistakeMap = new Map<string, { count: number; sources: Set<string> }>();

  scripts.forEach((script) => {
    const latestBreakdown = script.breakdowns?.[0];
    const sections = parseBreakdownSections(latestBreakdown?.content);
    const lines = extractBulletLines(
      script.standardAnalysis?.commonMistakes,
      pickSection(sections, ["常见错误", "最近高频错误", "错误", "翻车"]),
      pickSection(sections, ["我需要特别注意什么", "今日新增要求"])
    );

    lines.forEach((line) => {
      const existing = mistakeMap.get(line) || { count: 0, sources: new Set<string>() };
      existing.count += 1;
      existing.sources.add(script.title);
      mistakeMap.set(line, existing);
    });
  });

  return Array.from(mistakeMap.entries())
    .map(([text, value]) => ({
      text,
      count: value.count,
      sources: Array.from(value.sources).slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 12);
};

const buildMethodItems = (scripts: ScriptSummary[]): MethodItem[] => {
  const items: MethodItem[] = [];

  scripts.forEach((script) => {
    const latestBreakdown = script.breakdowns?.[0];
    const sections = parseBreakdownSections(latestBreakdown?.content);
    const updatedAt =
      script.updateLogs?.[0]?.createdAt ||
      script.standardAnalysis?.updatedAt ||
      latestBreakdown?.updatedAt ||
      script.updatedAt;

    const candidates = [
      { kind: "最近更新", title: "最近更新方法", body: script.updateLogs?.[0]?.summary || "" },
      {
        kind: "爆点总结",
        title: "为什么爆",
        body: script.standardAnalysis?.whyItWorked || pickSection(sections, ["核心学习点", "我认为这条爆的原因"]),
      },
      {
        kind: "注意事项",
        title: "注意事项",
        body: script.standardAnalysis?.whatToWatch || pickSection(sections, ["我需要特别注意什么"]),
      },
      {
        kind: "执行要求",
        title: "执行要求",
        body: script.standardAnalysis?.todayExecution || pickSection(sections, ["今日执行要求"]),
      },
      {
        kind: "优秀方法",
        title: "优秀方法",
        body: pickSection(sections, ["最近表现好的方法", "本周优秀案例"]),
      },
    ];

    candidates.forEach((candidate, index) => {
      const body = toPlainText(candidate.body);
      if (!body) return;
      items.push({
        id: `${script.id}-${candidate.kind}-${index}`,
        title: candidate.title,
        body,
        sourceTitle: script.title,
        updatedAt,
        kind: candidate.kind,
      });
    });
  });

  return items
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 18);
};

export default function ViralVideosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("cases");
  const [videos, setVideos] = useState<ViralVideo[]>([]);
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptsLoading, setScriptsLoading] = useState(true);
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
    fetchScripts();
  }, []);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/viral-videos");
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (fetchError) {
      console.error("获取视频列表失败:", fetchError);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchScripts = async () => {
    try {
      setScriptsLoading(true);
      const res = await fetch("/api/scripts?status=active");
      const data = await res.json();
      setScripts(data.scripts || []);
    } catch (fetchError) {
      console.error("获取脚本列表失败:", fetchError);
      setScripts([]);
    } finally {
      setScriptsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const url = editingVideo ? `/api/viral-videos/${editingVideo.id}` : "/api/viral-videos";
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
    } catch (submitError: any) {
      setError(submitError.message || "网络错误，请重试");
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
    } catch (deleteError) {
      console.error("删除失败:", deleteError);
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

  const recommendedVideos = useMemo(() => buildRecommendedVideos(videos), [videos]);
  const mistakeItems = useMemo(() => buildMistakeItems(scripts), [scripts]);
  const methodItems = useMemo(() => buildMethodItems(scripts), [scripts]);

  const renderVideoCard = (video: ViralVideo) => (
    <div
      key={video.id}
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-gray-900 line-clamp-2 flex-1">{video.title}</h3>
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
            <div className="text-lg font-bold text-gray-900">{formatNumber(video.viewCount)}</div>
            <div className="text-xs text-gray-500">播放</div>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-pink-600">{formatNumber(video.likeCount)}</div>
            <div className="text-xs text-gray-500">点赞</div>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-blue-600">{formatNumber(video.commentCount)}</div>
            <div className="text-xs text-gray-500">评论</div>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <div className="text-lg font-bold text-green-600">{formatNumber(video.shareCount)}</div>
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
            {video.tags.split(",").map((tag, index) => (
              <span
                key={`${video.id}-${tag}-${index}`}
                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded"
              >
                {tag.trim()}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <span className="text-gray-400">拆解人:</span>
              <span className="text-gray-700 font-medium">{getUserDisplayName(video.createdBy)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">创建:</span>
              <span>{formatDateTime(video.createdAt)}</span>
            </div>
          </div>
          {(video.updatedBy || video.updatedAt !== video.createdAt) && (
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
              <div className="flex items-center gap-1">
                <span className="text-gray-400">修改人:</span>
                <span className="text-gray-700 font-medium">{getUserDisplayName(video.updatedBy)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">更新:</span>
                <span>{formatDateTime(video.updatedAt)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
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
  );

  return (
    <div className="p-6">
      <PageHeader
        title="爆款案例库"
        description="回答“什么视频爆了、为什么爆、哪些值得学习”"
        actions={
          <button
            onClick={() => {
              setActiveTab("cases");
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

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-3 text-sm text-gray-600">
          {TAB_OPTIONS.find((tab) => tab.key === activeTab)?.description}
        </div>
      </div>

      {activeTab === "cases" && (
        <>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : videos.length === 0 ? (
            <EmptyState
              title="暂无案例"
              description="点击上方按钮添加第一个爆款案例。"
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
              {videos.map((video) => renderVideoCard(video))}
            </div>
          )}
        </>
      )}

      {activeTab === "recommended" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs font-semibold text-emerald-700">高播放优先</div>
              <div className="mt-1 text-sm text-emerald-900">优先读取播放和互动表现更高的案例。</div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-xs font-semibold text-blue-700">最近高表现</div>
              <div className="mt-1 text-sm text-blue-900">结合最近更新时间，优先看最近仍在跑量的内容。</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs font-semibold text-amber-700">自动派生</div>
              <div className="mt-1 text-sm text-amber-900">第一阶段只读派生，不单独存推荐案例数据。</div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : recommendedVideos.length === 0 ? (
            <EmptyState title="暂无推荐学习案例" description="先在案例库录入一些爆款案例后，这里会自动派生推荐内容。" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {recommendedVideos.map(({ video, reason }, index) => (
                <div key={video.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <span className="text-xs text-gray-500">{video.platform}</span>
                      </div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">{video.title}</div>
                      <div className="mt-2 text-sm text-gray-600">{reason}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("cases");
                        handleEdit(video);
                      }}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      查看案例
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                    <div className="rounded-lg bg-gray-50 p-2">
                      <div className="text-base font-semibold text-gray-900">{formatNumber(video.viewCount)}</div>
                      <div className="text-[11px] text-gray-500">播放</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-2">
                      <div className="text-base font-semibold text-pink-600">{formatNumber(video.likeCount)}</div>
                      <div className="text-[11px] text-gray-500">点赞</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-2">
                      <div className="text-base font-semibold text-blue-600">{formatNumber(video.commentCount)}</div>
                      <div className="text-[11px] text-gray-500">评论</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-2">
                      <div className="text-base font-semibold text-green-600">{formatNumber(video.shareCount)}</div>
                      <div className="text-[11px] text-gray-500">分享</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-700">
                    {video.hookAnalysis && (
                      <div>
                        <span className="font-medium text-gray-900">钩子：</span>
                        <span>{video.hookAnalysis}</span>
                      </div>
                    )}
                    {video.sellingPointAnalysis && (
                      <div>
                        <span className="font-medium text-gray-900">卖点：</span>
                        <span>{video.sellingPointAnalysis}</span>
                      </div>
                    )}
                    {video.reusableElements && (
                      <div>
                        <span className="font-medium text-gray-900">可复用方法：</span>
                        <span>{video.reusableElements}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "mistakes" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-600">
              当前只读聚合 scripts 体系已有的常见错误、负责人提醒和高频问题，不单独存“错误案例”。
            </div>
          </div>

          {scriptsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : mistakeItems.length === 0 ? (
            <EmptyState title="暂无错误案例" description="当前 scripts 体系里还没有可聚合的常见错误内容。" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {mistakeItems.map((item) => (
                <div key={item.text} className="rounded-xl border border-red-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-base font-semibold text-gray-900">{item.text}</div>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                      {item.count} 次
                    </span>
                  </div>
                  {item.sources.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-gray-500">来源案例</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.sources.map((source) => (
                          <span
                            key={`${item.text}-${source}`}
                            className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                          >
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "methods" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-600">
              当前只读复用 scripts 体系中的 SOP、拆解方法、最近更新和执行经验，不单独新增方法表。
            </div>
          </div>

          {scriptsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : methodItems.length === 0 ? (
            <EmptyState title="暂无方法库内容" description="当前 scripts 体系里还没有可直接展示的方法内容。" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {methodItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-blue-600">{item.kind}</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{item.title}</div>
                    </div>
                    <span className="shrink-0 text-xs text-gray-500">{formatDate(item.updatedAt)}</span>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {item.body}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{item.sourceTitle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">{editingVideo ? "编辑视频分析" : "添加视频分析"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {editingVideo && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">协作信息</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">拆解人:</span>
                      <span className="ml-2 text-gray-900 font-medium">
                        {getUserDisplayName(editingVideo.createdBy)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">创建时间:</span>
                      <span className="ml-2 text-gray-900">{formatDateTime(editingVideo.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">最后修改人:</span>
                      <span className="ml-2 text-gray-900 font-medium">
                        {getUserDisplayName(editingVideo.updatedBy)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">最后修改时间:</span>
                      <span className="ml-2 text-gray-900">{formatDateTime(editingVideo.updatedAt)}</span>
                    </div>
                  </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">平台</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">视频链接</label>
                  <input
                    type="url"
                    value={formData.sourceUrl}
                    onChange={(e) => setFormData({ ...formData, sourceUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">视频时长(秒)</label>
                  <input
                    type="number"
                    value={formData.videoDuration}
                    onChange={(e) =>
                      setFormData({ ...formData, videoDuration: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">播放量</label>
                  <input
                    type="number"
                    value={formData.viewCount}
                    onChange={(e) =>
                      setFormData({ ...formData, viewCount: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">点赞数</label>
                  <input
                    type="number"
                    value={formData.likeCount}
                    onChange={(e) =>
                      setFormData({ ...formData, likeCount: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">评论数</label>
                  <input
                    type="number"
                    value={formData.commentCount}
                    onChange={(e) =>
                      setFormData({ ...formData, commentCount: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分享数</label>
                  <input
                    type="number"
                    value={formData.shareCount}
                    onChange={(e) =>
                      setFormData({ ...formData, shareCount: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="font-medium text-gray-900 mb-3">内容拆解</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">前3秒钩子分析</label>
                    <textarea
                      value={formData.hookAnalysis}
                      onChange={(e) => setFormData({ ...formData, hookAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析视频开头如何吸引用户..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">卖点呈现分析</label>
                    <textarea
                      value={formData.sellingPointAnalysis}
                      onChange={(e) =>
                        setFormData({ ...formData, sellingPointAnalysis: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析产品卖点如何展示..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">节奏结构分析</label>
                    <textarea
                      value={formData.rhythmAnalysis}
                      onChange={(e) => setFormData({ ...formData, rhythmAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析视频节奏和段落分布..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">视觉呈现分析</label>
                    <textarea
                      value={formData.visualAnalysis}
                      onChange={(e) => setFormData({ ...formData, visualAnalysis: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      placeholder="分析镜头、画面、字幕等..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">音频分析</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">可复用元素</label>
                    <input
                      type="text"
                      value={formData.reusableElements}
                      onChange={(e) => setFormData({ ...formData, reusableElements: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="如：开场话术、转场技巧、BGM等"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">适用场景</label>
                    <input
                      type="text"
                      value={formData.applicableScenes}
                      onChange={(e) => setFormData({ ...formData, applicableScenes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="如：新品推广、促销活动等"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">关联产品SKU</label>
                    <input
                      type="text"
                      value={formData.productSku}
                      onChange={(e) => setFormData({ ...formData, productSku: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">标签(用逗号分隔)</label>
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
