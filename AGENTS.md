# Wig Management — Codex Working Rules

## Project

SUNNYMAY 假发业务后台。

Local project:
`/Users/yuyuhan/Desktop/dev/wig-management`

Current branch:
`preview-test`

Current stable baseline:
`139ebc9 feat: add product detail view`

Production:

- sunnymayhair.cn
- [www.sunnymayhair.cn](http://www.sunnymayhair.cn)
- sunnymay.vercel.app

---

## 1. Working Style

普通 UI / API：

implement → npm run build → review → commit

不要每个普通任务都先做大规模 PREVIEW。

只有以下高风险操作必须先 PREVIEW 并等待确认：

- Production 数据写入
- migration
- bulk database write
- inventory CONFIRM / ROLLBACK
- bulk import
- delete
- SKU / Alias identity changes
- permission/security sensitive changes

优先最小可落地方案。
够用就停。
不要过度设计。

---

## 2. Git Safety

禁止：

`git add .`

不要提交：

- `.env.local`
- `.local-backup/`
- `.open-next/`
- `backups/`
- `exports/`
- `.DS_Store`

提交时只显式 add 本次目标文件。

不要自动 push / deploy，除非明确要求。

---

## 3. Database Safety

Production DB 必须谨慎。

Local DB:

host: localhost / 127.0.0.1
port: 5432
database: wig\_management\_dev

任何 LOCAL 数据库写操作前必须确认 target 是：

`localhost:5432/wig_management_dev`

否则立即停止。

Prisma CLI 默认可能读取 `.env` 而不是 `.env.local`。
不要假设本地 Prisma 命令天然连接 local。

当前 local migration chain 无法从空库正常 replay。
不要擅自运行 Production migration 或 reset。

---

## 4. Inventory Rules

正式实时库存：

禁止使用 `Product.stock` 作为库存事实。

库存来源必须使用正式 inventory snapshot / resolver 体系。

Inventory import 是 snapshot，不是 delta。

PurchaseOrderItem.receivedQty：

不增加 sellable inventory。

采购收货与库存入库是两套独立业务事实。

当前库存计算不得重新发明算法。
优先复用现有 helper。

---

## 5. SKU Identity

SKU 匹配只允许：

1. `Product.sku` canonical SKU
2. 明确的 `ProductSkuAlias`

禁止：

- fuzzy match
- typo match
- product name guessing
- 自动把类似 SKU 合并
- 自动创建 Alias

采购关联 Product：

只认明确 `productId`。

不要通过名称 / SKU 猜测采购明细关联。

---

## 6. Data Ownership

Product 基础资料：
→ 产品库

新品开发：
→ 新品开发池

Supplier / PurchaseOrder / Payment / ETA：
→ 库存与订货

真实库存：
→ Inventory snapshot / 库存模块

成本 / 售价 / Supplier / businessStatus：
→ 商品经营

7D / 30D / 日均 / 可售天数 / inventoryRisk：
→ 销售分析

今日待处理：
→ 工作台

一个字段尽量只有一个 owner。

---

## 7. Product Rules

Product Detail:

`/dashboard/products/[id]`

定位：

只读经营档案 + owner 页面跳转。

不是第二编辑中心。

Product Detail：

- currentInventory 用正式 inventory helper
- sales 用现有 sales helper
- purchases 只按 PurchaseOrderItem.productId
- Alias 只读
- 不展示 Product.stock 作为库存
- 不重新计算 inventoryRisk
- 不重新计算 futureInventory

Product direct write permissions:

Create:
admin / boss / product

Edit base:
admin / boss / product

Change canonical SKU:
admin only

Deactivate Product:
admin / boss

Bulk base update:
admin / boss / product

Opportunity → Product:
admin / operator

---

## 8. Permission Architecture

必须区分：

Page Access
≠ Page Manage
≠ Business Action

页面访问统一以 `pagePermissions.ts` 为主。

业务写权限使用明确 helper。

API 必须做最终权限校验。
不能只靠 UI 隐藏按钮。

旧角色通过 `mapOldRole()`：

- lead → boss
- product\_operator → product
- optimizer → operator
- influencer\_operator → bd

不要再新增旧角色字符串数组。

---

## 9. WorkTask

WorkTask 正式角色：

admin / boss / product / operator / bd / editor

viewer 无 workbench 权限。

admin / boss：

- team view
- assign
- team manage
- sync

product / operator / bd / editor：

- 只管理本人范围 personal tasks
- 不看全团队
- 不指派他人
- 不运行 sync

不要重新设计 WorkTask schema 或任务算法，除非明确要求。

---

## 10. UI Direction

风格：

- 成熟
- 安静
- 实用
- 信息密度适中
- 像真实业务后台

避免：

- AI Dashboard 感
- 过多大卡片
- 大渐变
- 巨大圆角
- 大面积彩色背景
- 巨型成功提示
- 全屏品牌水印

优先：

- 浅背景
- 细边框
- 小标题
- 紧凑表格
- 少量状态 Badge
- top-center Toast
- 真正需要确认时用 modal

---

## 11. Architecture Direction

当前阶段重点：

收口、统一、提升日常效率。

不要优先增加：

- AI recommendation
- auto replenishment
- fuzzy search
- 自动 SKU merge
- 大量 dashboard charts
- 新 issue tables
- 不必要的新 DB table

优先复用现有事实和 helper。

---

## 12. Current Next Priorities

P0 权限工程已基本结束。

当前优先级：

1. Product Detail 视觉/实际业务验证
2. Global Search
3. 新品开发池 completed/history
4. 销售分析“需要处理 SKU”过滤
5. Audit Log 后续再做

Global Search 第一版应支持：

- Product SKU / name
- ProductSkuAlias
- Supplier
- PurchaseOrder.orderNo
- PurchaseOrderItem snapshot SKU/name
- ProductOpportunity
- Influencer
- WorkTask

规则：

exact + contains

禁止 fuzzy matching / auto association。

---

## 13. General Rule

修改前先读实际代码。

不要根据旧聊天假设代码仍然如此。

如果 AGENTS.md 与当前代码冲突：

先报告实际代码情况，
不要擅自按旧规则强行修改。
