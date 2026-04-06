# 阿里云部署指南

## 概述

将 wig-management 项目部署到阿里云 ECS + RDS PostgreSQL，使用域名 sunnymayhair.cn 访问。

## 部署架构

```
用户 -> 域名(sunnymayhair.cn) -> 阿里云 DNS -> ECS (Nginx) -> Node.js (Next.js) -> RDS PostgreSQL
```

## 准备工作

### 1. 购买阿里云 RDS PostgreSQL

1. 访问 https://rdsnext.console.aliyun.com/
2. 点击"创建实例"
3. 配置：
   - **数据库类型**：PostgreSQL
   - **版本**：14 或 15
   - **系列**：基础版（开发测试）或 高可用版（生产）
   - **规格**：2核4G（入门版）
   - **存储**：100GB
   - **地域**：华东1（杭州）或 华东2（上海）
4. 设置 root 密码（记住这个密码）
5. 创建数据库 `wig_management`
6. 记录连接地址（内网地址）

### 2. 购买阿里云 ECS

1. 访问 https://ecs.console.aliyun.com/
2. 点击"创建实例"
3. 配置：
   - **地域**：与 RDS 相同
   - **实例规格**：2核4G（ecs.t6-c1m2.large）
   - **镜像**：Ubuntu 22.04 LTS 64位
   - **系统盘**：40GB SSD
   - **带宽**：3Mbps（按量付费）
   - **安全组**：开放 22(SSH), 80(HTTP), 443(HTTPS)
4. 设置 root 密码或上传 SSH 密钥

### 3. 配置域名解析

1. 访问 https://dc.console.aliyun.com/
2. 找到域名 sunnymayhair.cn
3. 点击"解析"
4. 添加 A 记录：
   - **主机记录**：`@`
   - **记录值**：ECS 的公网 IP
   - **TTL**：10分钟
5. 添加 A 记录：
   - **主机记录**：`www`
   - **记录值**：ECS 的公网 IP

## 部署步骤

### 第一步：连接 ECS 并运行初始化脚本

```bash
# 使用 SSH 连接到 ECS（替换为你的 ECS IP）
ssh root@<ECS_IP>

# 下载并运行部署脚本
cd ~
curl -O https://raw.githubusercontent.com/your-repo/wig-management/main/deploy/aliyun-deploy.sh
chmod +x aliyun-deploy.sh
./aliyun-deploy.sh
```

或者直接执行：

```bash
# 1. 更新系统
apt-get update && apt-get upgrade -y

# 2. 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. 安装 PM2 和 Nginx
npm install -g pm2
apt-get install -y nginx

# 4. 创建应用目录
mkdir -p /var/www/wig-management
```

### 第二步：上传项目代码

**方式一：使用 Git（推荐）**

```bash
cd /var/www/wig-management
git clone https://github.com/your-username/wig-management.git .
```

**方式二：使用 SCP**

在本地终端执行：

```bash
# 压缩项目（排除 node_modules 和 .next）
cd /path/to/wig-management
tar -czvf wig-management.tar.gz --exclude='node_modules' --exclude='.next' --exclude='.git' .

# 上传到服务器
scp wig-management.tar.gz root@<ECS_IP>:/var/www/wig-management/

# 在服务器上解压
ssh root@<ECS_IP>
cd /var/www/wig-management
tar -xzvf wig-management.tar.gz
```

**方式三：使用 VS Code Remote SSH**

1. 安装 VS Code 插件 "Remote - SSH"
2. 连接到 ECS
3. 直接复制粘贴文件

### 第三步：配置环境变量

```bash
cd /var/www/wig-management

# 创建 .env 文件
cat > .env << 'EOF'
# 数据库连接（使用 RDS 内网地址）
DATABASE_URL="postgresql://root:<PASSWORD>@<RDS_INTERNAL_HOST>:5432/wig_management?sslmode=require"

# NextAuth 配置
NEXTAUTH_SECRET="your-secret-key-here-change-this"
NEXTAUTH_URL="https://sunnymayhair.cn"

# 管理员账号（首次运行时会创建）
ADMIN_EMAIL="admin@sunnymayhair.cn"
ADMIN_PASSWORD="your-admin-password"
ADMIN_NAME="管理员"
EOF
```

**注意替换：**
- `<PASSWORD>`：RDS 的 root 密码
- `<RDS_INTERNAL_HOST>`：RDS 的内网地址（在 RDS 控制台查看）

### 第四步：运行部署后脚本

```bash
cd /var/www/wig-management
chmod +x deploy/post-deploy.sh
./deploy/post-deploy.sh
```

脚本会自动：
1. 安装 npm 依赖
2. 生成 Prisma Client
3. 执行数据库迁移
4. 构建 Next.js 项目
5. 使用 PM2 启动应用
6. 配置 SSL 证书（可选）

### 第五步：配置 SSL 证书（HTTPS）

```bash
# 使用 Certbot 自动配置
certbot --nginx -d sunnymayhair.cn -d www.sunnymayhair.cn

# 按照提示操作
```

## 验证部署

1. 访问 http://sunnymayhair.cn 查看是否正常
2. 访问 https://sunnymayhair.cn 查看 HTTPS 是否正常
3. 登录后台测试功能

## 日常维护

### 查看应用状态
```bash
pm2 status
pm2 logs wig-management
```

### 重启应用
```bash
pm2 restart wig-management
```

### 更新代码
```bash
cd /var/www/wig-management
git pull
npm ci
npm run build
pm2 restart wig-management
```

### 备份数据库
```bash
# 在 RDS 控制台设置自动备份
# 或手动导出
pg_dump -h <RDS_HOST> -U root -d wig_management > backup.sql
```

## 故障排查

### 应用无法启动
```bash
# 查看日志
pm2 logs

# 检查环境变量
cat /var/www/wig-management/.env

# 检查端口占用
netstat -tlnp | grep 3000
```

### 数据库连接失败
```bash
# 测试数据库连接
psql "postgresql://root:<PASSWORD>@<RDS_HOST>:5432/wig_management?sslmode=require"

# 检查 RDS 白名单
# 确保 ECS 的 IP 在 RDS 白名单中
```

### Nginx 配置错误
```bash
# 检查配置
nginx -t

# 查看错误日志
tail -f /var/log/nginx/error.log
```

## 费用估算

| 服务 | 配置 | 月费用 |
|------|------|--------|
| ECS | 2核4G, 3Mbps | ~100元 |
| RDS PostgreSQL | 2核4G, 100GB | ~150元 |
| 域名 | sunnymayhair.cn | ~35元/年 |
| **总计** | | **~250元/月** |

## 安全建议

1. **修改默认端口**：将 SSH 端口改为非 22 端口
2. **配置防火墙**：仅开放必要端口
3. **定期更新**：及时更新系统和依赖
4. **备份数据**：设置自动备份策略
5. **监控告警**：配置云监控和告警

## 联系支持

如有问题，请检查：
1. 阿里云工单系统
2. 项目 GitHub Issues