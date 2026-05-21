# 项目当前状态说明

更新时间：2026-05-21

## 一、说明

当前这份 `PROJECT_STATUS.md` 是在旧版本基础上更新的。
原文件内容已经偏旧，主要停留在 2026-05-20 当时的阶段性状态，未覆盖后续已经完成并 push 的订单导入增强、诊断模式、缺失 SKU 处理等内容。

以下内容以当前仓库真实进度为准。

## 二、当前主线已完成进度

### 1. 产品销售库存基础能力
- 已新增 `ProductInventorySnapshot` 库存快照模型。
- 已补充对应 Prisma migration 文件。
- 库存快照用于保存每天每个 SKU 的库存数据。

### 2. 产品销售库存页面主功能
- 已完成库存 Excel 导入。
- 已完成订单导入基础能力。
- 已完成手动编辑库存。
- 已完成删除库存（清零当前库存，不删除产品和销量）。
- 已完成销售/库存趋势展示。
- 主表格已简化为只保留销售库存管理相关字段，不显示产品图片。

### 3. 手动分组能力
- 手动分组已落地并已 push。
- 支持新建、编辑、删除分组。
- 支持手动选择多个 SKU 加入分组。
- 分组配置保存到数据库模型 `ProductSalesGroup`。

### 4. 趋势区独立刷新
- 趋势区独立刷新已落地并已 push。
- 上方趋势筛选只影响趋势图数据。
- 下方库存总表保持全部 SKU，不跟随趋势筛选刷新或进入 loading。

### 5. 库存导入修复
- 已适配 TikTok Seller Center 库存 Excel 的真实格式。
- 已支持第 1 行表头、第 2/3 行说明跳过、第 4 行开始读取数据。
- 已支持字段名 `trim`。
- 已支持数量字段空值、`/` 等按 `0` 处理。
- 已优化库存导入时的 Product 匹配逻辑，尽量避免重复创建商品。

### 6. 订单导入增强
- 订单导入已支持退货/退款/取消统计。
- `PerformanceDaily.orders` 继续代表净销量，兼容现有页面。
- 已支持：
  - `grossOrders`
  - `returnQty`
  - `netOrders`
  - `canceledQty`
  - `refundAmount`
- 已支持 CSV 和 XLSX。
- 已支持 `dryRun=1` 诊断模式。
- 已支持 `checkOnly=1` 诊断模式。
- `checkOnly` 现在也能显示汇总销量，不再只是 SKU 匹配结果。
- 缺失 SKU 现在单独展示，不再和真正异常混在一起。
- `Seller SKU` 为空的订单行现在进入 `skippedRows`，不再误显示成严重失败。
- 订单写入已做批量写入优化，降低接口压力。

## 三、当前主线待继续确认事项

### 1. 订单导入线上稳定性
- 虽然已增加 `dryRun` / `checkOnly` / 分阶段诊断 / 超时保护 / 批量写入优化，但仍需继续用真实 CSV 与 XLSX 在部署环境验证稳定性。
- 重点观察：
  - `dryRun`
  - `checkOnly`
  - 正式导入
  三种模式下是否都能稳定返回 JSON。

### 2. 缺失 SKU 的产品库补齐
- 当前已能明确列出缺失 SKU。
- 后续需要根据导入结果补齐正式产品库中的 `Product.sku`，再重新导入订单。

## 四、当前未跟踪文件分类

### 1. 可考虑提交的项目文档
- `PROJECT_STATUS.md`

说明：
- 可以作为项目交接文档保留。
- 但应始终保持更新，避免再次过期。

### 2. 可能是正式功能代码，但需要确认
- `src/lib/supabase.ts`
- `src/app/api/init-storage/`
- `scripts/setup-storage.js`
- `setup-preview-storage.sh`

说明：
- 这条线属于 Supabase Storage / 图片上传相关能力。
- 暂不属于当前“产品销售库存 / 订单导入”主线。
- 目前先不提交、不处理。

### 3. 明显不应提交的备份/数据文件
- `Influencer.json`
- `backup/`
- `neon-backup-2026-05-05/`

### 4. 明显不应提交的临时/排查/测试脚本
- `backup-production-influencers.js`
- `check-*.js`
- `test-*.js`
- `export-neon-data*.js`
- `import-influencers-to-*.js`
- `explore-neon-schema.js`

## 五、当前主线之外的说明

### Supabase Storage / 图片上传线
- 当前仓库里存在一条单独的 Supabase Storage / 图片上传相关工作线：
  - `src/lib/supabase.ts`
  - `src/app/api/init-storage/`
  - `scripts/setup-storage.js`
  - `setup-preview-storage.sh`
- 这条线暂不属于当前主线任务。
- 当前主线以“产品销售库存”和“订单导入”稳定性为主。
- 因此这条线当前不提交、不混入正式功能提交。

## 六、下一步建议

建议按下面顺序继续：

### 第一步：继续验证订单导入
- 先用真实订单 CSV 测 `dryRun`
- 再测 `checkOnly`
- 最后测正式导入

重点确认：
- 接口是否稳定返回 JSON
- 缺失 SKU 是否单独展示
- `skippedRows` 是否只统计 `Seller SKU` 为空等可跳过行
- 已匹配 SKU 是否能成功写入 `PerformanceDaily`

### 第二步：补齐缺失 SKU
- 根据 `checkOnly` / 正式导入返回的 `missingSkus`
- 在产品库中补齐 `Product.sku`
- 再重新导入订单

### 第三步：保持主线收敛
- 当前不要把 Supabase Storage / 图片上传线混入主线提交
- 当前不要提交备份数据、导出数据、临时脚本、测试脚本

### 第四步：数据库执行提醒
- 不要用当前 `DATABASE_URL`（Supabase pooler）跑 migration。
- 如需执行已有 migration SQL，仍应手动在 Supabase SQL Editor 中执行。
