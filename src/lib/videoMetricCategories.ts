export const VIDEO_METRIC_CATEGORY_OPTIONS = [
  { value: "real_try_on", label: "真人试戴" },
  { value: "color_showcase", label: "颜色展示" },
  { value: "unboxing", label: "开箱展示" },
  { value: "product_detail", label: "产品细节" },
  { value: "influencer_talk", label: "达人口播" },
  { value: "scenario_seeding", label: "场景种草" },
  { value: "comparison_review", label: "对比测评" },
  { value: "after_sales_feedback", label: "售后反馈" },
  { value: "live_clip", label: "直播切片" },
  { value: "other", label: "其他" },
] as const;

export const VIDEO_METRIC_CATEGORY_LABELS = Object.fromEntries(
  VIDEO_METRIC_CATEGORY_OPTIONS.map((option) => [option.value, option.label])
) as Record<(typeof VIDEO_METRIC_CATEGORY_OPTIONS)[number]["value"], string>;

export type VideoMetricCategory = keyof typeof VIDEO_METRIC_CATEGORY_LABELS;

export function normalizeVideoMetricCategory(value?: string | null): VideoMetricCategory {
  if (!value) {
    return "other";
  }

  return value in VIDEO_METRIC_CATEGORY_LABELS
    ? (value as VideoMetricCategory)
    : "other";
}

export function getVideoMetricCategoryLabel(value?: string | null): string {
  return VIDEO_METRIC_CATEGORY_LABELS[normalizeVideoMetricCategory(value)];
}
