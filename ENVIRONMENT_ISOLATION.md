# 环境隔离配置指南

## 当前环境状态

| 环境 | 数据库连接 | 状态 |
|------|------------|------|
| **Production** | Supabase 正式数据库 | ✅ 已隔离 |
| **Preview** | 与 Production 共用 | ⚠️ 需手动配置 |
| **Development** | 本地 PostgreSQL | ✅ 已隔离 |

## 环境隔离配置步骤

### 1. Production 环境（已配置）

**数据库**: Supabase 正式数据库
**环境变量**:
- `DATABASE_URL` → Production only
- `DIRECT_URL` → Production only

### 2. Preview 环境（需配置）

**选项 A: 使用 Supabase 分支（推荐）**

1. 登录 Supabase Dashboard
2. 进入项目 → Branches
3. 创建新分支 `preview`
4. 获取分支的数据库连接字符串
5. 在 Vercel Dashboard 中添加环境变量:
   - `DATABASE_URL` → Preview 环境
   - `DIRECT_URL` → Preview 环境

**选项 B: 使用独立 Supabase 项目**

1. 创建新的 Supabase 项目
2. 获取数据库连接字符串
3. 在 Vercel Dashboard 中配置

**选项 C: 使用 Vercel Postgres（如果可用）**

```bash
vercel postgres create
```

### 3. Development 环境（已配置）

**数据库**: 本地 PostgreSQL
**配置文件**: `.env.local`

```bash
DATABASE_URL="postgresql://localhost:5432/wig_management_dev?schema=public"
DIRECT_URL="postgresql://localhost:5432/wig_management_dev?schema=public"
```

## 验证环境隔离

### 检查环境变量
```bash
# 查看 Production 环境变量
npx vercel env ls production

# 查看 Preview 环境变量
npx vercel env ls preview

# 查看 Development 环境变量
npx vercel env ls development
```

### 验证数据库连接
```bash
# 部署到 Preview 后检查
npx vercel --target=preview
# 然后访问 Preview 链接，检查数据是否独立
```

## 环境隔离确认清单

- [ ] Production 使用正式数据库
- [ ] Preview 使用独立数据库（分支或独立项目）
- [ ] Development 使用本地数据库
- [ ] Preview 部署不影响 Production 数据
- [ ] 各环境数据库结构一致（通过 Prisma migrate）

## 注意事项

1. **Preview 环境数据库**: 建议定期清理，避免数据膨胀
2. **数据库迁移**: 在 Preview 环境测试通过后，再应用到 Production
3. **敏感数据**: Preview 环境不应包含真实用户数据
