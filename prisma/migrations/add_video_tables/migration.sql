-- CreateTable
CREATE TABLE "OwnVideoMetric" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TikTok',
    "sourceUrl" TEXT,
    "videoDuration" INTEGER NOT NULL DEFAULT 0,
    "contentType" TEXT NOT NULL DEFAULT 'product_showcase',
    "productSku" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "addToCarts" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWatchTime" INTEGER NOT NULL DEFAULT 0,
    "adSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnVideoMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViralVideoAnalysis" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TikTok',
    "sourceUrl" TEXT,
    "videoDuration" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "hookAnalysis" TEXT NOT NULL DEFAULT '',
    "sellingPointAnalysis" TEXT NOT NULL DEFAULT '',
    "rhythmAnalysis" TEXT NOT NULL DEFAULT '',
    "visualAnalysis" TEXT NOT NULL DEFAULT '',
    "audioAnalysis" TEXT NOT NULL DEFAULT '',
    "reusableElements" TEXT NOT NULL DEFAULT '',
    "applicableScenes" TEXT NOT NULL DEFAULT '',
    "productSku" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViralVideoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnVideoMetric_platform_idx" ON "OwnVideoMetric"("platform");

-- CreateIndex
CREATE INDEX "OwnVideoMetric_productSku_idx" ON "OwnVideoMetric"("productSku");

-- CreateIndex
CREATE INDEX "OwnVideoMetric_publishedAt_idx" ON "OwnVideoMetric"("publishedAt");

-- CreateIndex
CREATE INDEX "OwnVideoMetric_contentType_idx" ON "OwnVideoMetric"("contentType");

-- CreateIndex
CREATE INDEX "OwnVideoMetric_createdById_idx" ON "OwnVideoMetric"("createdById");

-- CreateIndex
CREATE INDEX "ViralVideoAnalysis_platform_idx" ON "ViralVideoAnalysis"("platform");

-- CreateIndex
CREATE INDEX "ViralVideoAnalysis_productSku_idx" ON "ViralVideoAnalysis"("productSku");

-- CreateIndex
CREATE INDEX "ViralVideoAnalysis_createdAt_idx" ON "ViralVideoAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "ViralVideoAnalysis_viewCount_idx" ON "ViralVideoAnalysis"("viewCount");

-- AddForeignKey
ALTER TABLE "OwnVideoMetric" ADD CONSTRAINT "OwnVideoMetric_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViralVideoAnalysis" ADD CONSTRAINT "ViralVideoAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
