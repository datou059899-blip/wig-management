# 数据库迁移指南：Neon → Supabase

## 当前状况
- Neon 数据库配额超限，数据无法导出
- 需要切换到 Supabase PostgreSQL
- 可用 seed.ts 恢复基础数据（管理员账号、默认配置）

## 第一步：创建 Supabase 项目

1. 访问 https://supabase.com/dashboard
2. 点击 "New Project"
3. 填写：
   - Organization: 选择你的组织
   - Project name: `wig-management-prod`
   - Database Password: 生成强密码（保存好！）
   - Region: `East US (N. Virginia)` 或靠近用户的区域
4. 等待项目创建完成（约 2 分钟）

## 第二步：获取数据库连接字符串

项目创建完成后：

1. 进入 Project Settings → Database
2. 找到 "Connection string" 部分
3. 选择 **URI** 格式
4. 复制连接字符串，格式如下：
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
   ```

## 第三步：更新 Vercel 环境变量

在 Vercel Dashboard 中：

1. 进入项目 → Settings → Environment Variables
2. 修改以下变量（Production 环境）：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1` | 连接池 URL |
| `DIRECT_URL` | `postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres` | 直连 URL |

3. 保存并重新部署

## 第四步：初始化数据库

部署完成后，执行：

```bash
# 1. 更新本地环境变量
cd /Users/yuyuhan/Desktop/dev/wig-management
npx vercel env pull .env.local

# 2. 推送数据库结构
npx prisma db push

# 3. 执行 seed 恢复基础数据
npx prisma db seed
```

## 第五步：验证恢复

检查以下页面是否正常：
- [ ] 登录页面
- [ ] 产品库
- [ ] 达人建联
- [ ] 今日工作台
- [ ] 用户管理

## 数据恢复情况

| 数据类型 | 恢复方式 | 状态 |
|---------|---------|------|
| 管理员账号 | seed.ts | ✅ 可恢复 |
| 系统配置 | seed.ts | ✅ 可恢复 |
| 产品数据 | 无法导出 | ❌ 需重新录入 |
| 达人数据 | 无法导出 | ❌ 需重新录入 |
| 任务数据 | 无法导出 | ❌ 需重新录入 |
| 寄样记录 | 无法导出 | ❌ 需重新录入 |

## 注意事项

1. Supabase 免费版限制：
   - 500MB 数据库空间
   - 2GB 带宽/月
   - 足够当前使用

2. 如果后续需要导出 Neon 数据：
   - 等待配额重置（每月 1 日）
   - 或升级 Neon 付费计划临时导出

## 紧急联系

如果操作过程中遇到问题，请保留所有错误信息。
