export const OTHER_VIDEO_METRIC_CATEGORY_KEY = "other";

export type VideoMetricCategoryRecord = {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export const DEFAULT_VIDEO_METRIC_CATEGORIES: VideoMetricCategoryRecord[] = [
  { key: "real_try_on", name: "真人试戴", sortOrder: 10, isActive: true },
  { key: "color_showcase", name: "颜色展示", sortOrder: 20, isActive: true },
  { key: "unboxing", name: "开箱展示", sortOrder: 30, isActive: true },
  { key: "product_detail", name: "产品细节", sortOrder: 40, isActive: true },
  { key: "influencer_talk", name: "达人口播", sortOrder: 50, isActive: true },
  { key: "scenario_seeding", name: "场景种草", sortOrder: 60, isActive: true },
  { key: "comparison_review", name: "对比测评", sortOrder: 70, isActive: true },
  { key: "after_sales_feedback", name: "售后反馈", sortOrder: 80, isActive: true },
  { key: "live_clip", name: "直播切片", sortOrder: 90, isActive: true },
  { key: OTHER_VIDEO_METRIC_CATEGORY_KEY, name: "其他", sortOrder: 999, isActive: true },
];

export const VIDEO_METRIC_CATEGORY_OPTIONS = DEFAULT_VIDEO_METRIC_CATEGORIES.filter(
  (item) => item.isActive
).map((item) => ({ value: item.key, label: item.name })) as ReadonlyArray<{
  value: string;
  label: string;
}>;

export const VIDEO_METRIC_CATEGORY_LABELS = Object.fromEntries(
  DEFAULT_VIDEO_METRIC_CATEGORIES.map((item) => [item.key, item.name])
) as Record<string, string>;

export function normalizeVideoMetricCategory(value?: string | null): string {
  if (!value || !value.trim()) {
    return OTHER_VIDEO_METRIC_CATEGORY_KEY;
  }

  return value.trim();
}

export function getDefaultVideoMetricCategories(): VideoMetricCategoryRecord[] {
  return DEFAULT_VIDEO_METRIC_CATEGORIES.map((item) => ({ ...item }));
}

export function buildVideoMetricCategoryLabelMap(
  categories: Array<Pick<VideoMetricCategoryRecord, "key" | "name">> = []
): Record<string, string> {
  return categories.reduce<Record<string, string>>(
    (map, category) => {
      map[category.key] = category.name;
      return map;
    },
    { ...VIDEO_METRIC_CATEGORY_LABELS }
  );
}

export function getVideoMetricCategoryLabel(
  value?: string | null,
  labelMap?: Record<string, string>
): string {
  const normalized = normalizeVideoMetricCategory(value);
  return labelMap?.[normalized] || VIDEO_METRIC_CATEGORY_LABELS[normalized] || normalized || VIDEO_METRIC_CATEGORY_LABELS[OTHER_VIDEO_METRIC_CATEGORY_KEY];
}

export function sortVideoMetricCategories<T extends Pick<VideoMetricCategoryRecord, "key" | "sortOrder" | "name">>(
  categories: T[]
): T[] {
  return [...categories].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export function makeVideoMetricCategoryKey(input?: string | null): string {
  const raw = (input || "").trim();
  if (!raw) {
    return `custom_${Date.now().toString(36)}`;
  }

  const asciiKey = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (asciiKey) {
    return asciiKey;
  }

  return `custom_${Date.now().toString(36)}`;
}
