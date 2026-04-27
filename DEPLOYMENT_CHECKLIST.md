# Sunnymay 部署检查清单

## 一、数据恢复排查结果

### 1.1 当前数据库状态（Supabase）

| 表名 | 状态 | 记录数 | 说明 |
|------|------|--------|------|
| User | ⚠️ | 1 | 有用户但无管理员角色 |
| Product | ❌ | 0 | 空表 |
| Influencer | ❌ | 0 | 空表 |
| WorkTask | ❌ | 0 | 空表 |
| Shipment | ❌ | - | 表不存在 |
| FollowUp | ❌ | - | 表不存在 |
| Script | ❌ | - | 表不存在 |
| SystemConfig | ❌ | - | 表不存在 |
| Department | ❌ | - | 表不存在 |
| Role | ❌ | - | 表不存在 |

### 1.2 旧数据恢复可能性

| 数据来源 | 能否恢复 | 原因 |
|----------|----------|------|
| **Neon 数据库** | ❌ 不能 | 配额超限，无法导出 |
| **本地备份** | ❌ 不能 | 无备份文件 |
| **Seed 文件** | ⚠️ 部分 | 仅管理员+基础配置 |
| **Vercel 日志** | ❌ 不能 | 无业务数据记录 |

### 1.3 结论

**已丢失数据（无法恢复）**:
- ❌ 所有产品数据（Product）
- ❌ 所有达人数据（Influencer）
- ❌ 所有任务数据（WorkTask）
- ❌ 所有寄样记录（Shipment）
- ❌ 所有跟进记录（FollowUp）
- ❌ 所有脚本数据（Script）

**可恢复数据**:
- ✅ 管理员账号（通过 seed）
- ✅ 系统配置（通过 seed）
- ✅ 用户角色（通过 seed）

---

## 二、环境配置现状

### 2.1 Vercel 环境变量

| 变量名 | Production | Preview | Development | 状态 |
|--------|------------|---------|-------------|------|
| DATABASE_URL | Supabase | ❌ 未配置 | ❌ 未配置 | ⚠️ 需完善 |
| DIRECT_URL | Supabase | ❌ 未配置 | ❌ 未配置 | ⚠️ 需完善 |
| NEXTAUTH_URL | 已配置 | ❌ 未配置 | ❌ 未配置 | ⚠️ 需完善 |
| NEON_DATABASE_* | 存在 | 存在 | 存在 | ⚠️ 可清理 |

### 2.2 数据库风险点

1. **Preview 环境未隔离** - 所有预览部署共用 Production 数据库
2. **Development 环境混乱** - 本地开发可能连到生产库
3. **无自动备份** - Supabase 免费版无自动备份
4. **无数据导出机制** - 再次发生迁移时仍无法导出

---

## 三、部署前检查清单

### 3.1 环境确认

- [ ] 确认当前环境（Production/Preview/Development）
- [ ] 检查 DATABASE_URL 指向正确数据库
- [ ] 检查 DIRECT_URL 指向正确数据库
- [ ] 确认不会误操作生产数据

### 3.2 数据备份

- [ ] 导出当前数据库（如可能）
- [ ] 保存重要业务数据截图/记录
- [ ] 确认 seed 文件包含必要基础数据

### 3.3 部署验证

- [ ] 登录页正常显示
- [ ] 管理员账号可登录
- [ ] 用户管理页面正常
- [ ] 产品库页面正常（即使为空）
- [ ] 达人建联页面正常
- [ ] 今日工作台正常

### 3.4 部署后检查

- [ ] 检查数据库表结构完整
- [ ] 验证管理员账号权限
- [ ] 测试核心功能流程
- [ ] 确认无 500 错误

---

## 四、环境分离建议

### 4.1 推荐架构

```
Production  →  Supabase Production (付费)
Preview     →  Supabase Preview (免费/独立)
Development →  本地 Docker PostgreSQL
```

### 4.2 立即执行

1. **创建 Preview 数据库**
   - 在 Supabase 创建第二个项目
   - 配置 Preview 环境变量

2. **本地开发隔离**
   - 使用 Docker 运行本地 PostgreSQL
   - 配置 .env.local 指向本地

3. **定期备份**
   - 设置 Supabase 自动备份（付费）
   - 或每周手动导出一次

### 4.3 环境变量配置

**Production**:
```
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres
NEXTAUTH_URL=https://sunnymay.vercel.app
```

**Preview**:
```
DATABASE_URL=postgresql://postgres.[PREVIEW_REF]:[PASSWORD]@...
DIRECT_URL=postgresql://postgres.[PREVIEW_REF]:[PASSWORD]@...
NEXTAUTH_URL=https://preview-domain.vercel.app
```

**Development**:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wig_management
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/wig_management
NEXTAUTH_URL=http://localhost:3002
```

---

## 五、数据恢复建议

### 5.1 短期（本周）

1. **手动重建基础数据**
   - 重新录入产品信息
   - 重新录入达人信息
   - 建立新的任务记录

2. **建立备份习惯**
   - 每周导出一次数据
   - 重要操作前手动备份

### 5.2 中期（本月）

1. **升级 Supabase 到付费版**
   - 启用自动备份
   - 支持数据导出

2. **建立数据导入导出功能**
   - 产品批量导入
   - 达人批量导入
   - 数据定期导出

### 5.3 长期（本季度）

1. **完善 seed 文件**
   - 包含示例产品
   - 包含示例达人
   - 包含示例任务

2. **建立数据迁移流程**
   - 数据库版本控制
   - 数据迁移脚本
   - 回滚机制

---

## 六、紧急联系

如再次遇到数据库问题：

1. **立即停止部署** - 不要覆盖现有数据
2. **检查环境变量** - 确认 DATABASE_URL 指向
3. **联系技术支持** - Supabase/Vercel 客服
4. **恢复 seed 数据** - 至少保证基础功能可用

---

**最后更新**: 2024-04-27
**下次检查**: 每次部署前
