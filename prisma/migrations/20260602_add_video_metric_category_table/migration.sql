CREATE TABLE IF NOT EXISTS "VideoMetricCategory" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VideoMetricCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VideoMetricCategory_key_key"
ON "VideoMetricCategory"("key");

CREATE INDEX IF NOT EXISTS "VideoMetricCategory_isActive_idx"
ON "VideoMetricCategory"("isActive");

CREATE INDEX IF NOT EXISTS "VideoMetricCategory_sortOrder_idx"
ON "VideoMetricCategory"("sortOrder");

INSERT INTO "VideoMetricCategory" ("id", "key", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'real_try_on', '真人试戴', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'color_showcase', '颜色展示', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'unboxing', '开箱展示', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'product_detail', '产品细节', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'influencer_talk', '达人口播', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'scenario_seeding', '场景种草', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'comparison_review', '对比测评', 70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'after_sales_feedback', '售后反馈', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'live_clip', '直播切片', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'other', '其他', 999, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
