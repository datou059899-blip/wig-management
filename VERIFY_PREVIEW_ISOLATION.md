# Preview 环境隔离验证指南

## 当前状态

✅ **代码已推送**: `main` 分支已更新  
🔄 **Production 部署中**: 正在构建  
⏳ **Preview 部署**: 需要创建 PR 触发

## 验证步骤

### 步骤 1: 创建 PR 触发 Preview 部署

```bash
# 创建新分支
git checkout -b test-preview-isolation

# 做一些小修改（比如更新 README）
echo "# Preview Test" >> README.md
git add README.md
git commit -m "test: trigger preview deployment"

# 推送并创建 PR
git push origin test-preview-isolation
```

然后在 GitHub 上创建 Pull Request，Vercel 会自动创建 Preview 部署。

### 步骤 2: 验证 Preview 数据库连接

Preview 部署完成后，访问 Preview 链接，然后执行：

```bash
# 在浏览器控制台执行
fetch('/api/health-check')
  .then(r => r.json())
  .then(console.log)
```

或者创建一个测试 API：

```bash
# 创建测试文件 src/app/api/test-db/route.ts
cat > src/app/api/test-db/route.ts << 'EOF'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // 查询数据库信息
    const result = await prisma.$queryRaw`SELECT current_database(), inet_server_addr(), inet_server_port()`;
    
    // 查询用户数量
    const userCount = await prisma.user.count();
    
    return NextResponse.json({
      database: result[0],
      userCount,
      environment: process.env.VERCEL_ENV || 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      environment: process.env.VERCEL_ENV || 'unknown',
    }, { status: 500 });
  }
}
EOF
```

### 步骤 3: 对比 Production 和 Preview

访问以下链接并对比输出：

**Production**: https://sunnymay.vercel.app/api/test-db  
**Preview**: https://[preview-url]/api/test-db

如果数据库信息不同，说明隔离成功。

### 步骤 4: 执行 Prisma 迁移

在本地使用 Preview 数据库连接字符串执行：

```bash
# 设置 Preview 数据库连接
export DATABASE_URL="你的 Preview DATABASE_URL"
export DIRECT_URL="你的 Preview DIRECT_URL"

# 执行迁移
npx prisma migrate deploy

# 或者使用 db push
npx prisma db push
```

### 步骤 5: 验证表结构

```bash
# 连接 Preview 数据库查看表
npx prisma studio
```

## 验证清单

- [ ] Preview 部署成功
- [ ] Preview 数据库与 Production 不同
- [ ] Prisma 迁移成功执行
- [ ] 表结构已建立
- [ ] 在 Preview 添加测试数据不影响 Production

## 快速验证命令

```bash
# 1. 检查环境变量
echo "Preview DATABASE_URL 配置:"
npx vercel env ls preview | grep DATABASE_URL

# 2. 触发 Preview 部署
git checkout -b preview-test
git push origin preview-test
# 然后在 GitHub 创建 PR

# 3. 部署完成后测试
curl https://[preview-url]/api/test-db
```

## 预期结果

| 检查项 | Production | Preview |
|--------|------------|---------|
| 数据库名称 | postgres | preview 或不同名称 |
| 用户数量 | 实际用户 | 0 或测试用户 |
| 数据修改 | 影响真实数据 | 不影响 Production |

如果以上都符合，说明 Preview 环境已彻底隔离。
