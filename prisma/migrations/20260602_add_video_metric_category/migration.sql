ALTER TABLE "OwnVideoMetric"
ADD COLUMN "videoCategory" TEXT NOT NULL DEFAULT 'other';

CREATE INDEX "OwnVideoMetric_videoCategory_idx"
ON "OwnVideoMetric"("videoCategory");
