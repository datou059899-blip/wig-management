#!/bin/bash
# 部署后配置脚本
# 在代码上传到服务器后运行

set -e

cd /var/www/wig-management

echo "=== 开始部署后配置 ==="

# 1. 安装依赖
echo "[1/5] 安装依赖..."
npm ci

# 2. 生成 Prisma Client
echo "[2/5] 生成 Prisma Client..."
npx prisma generate

# 3. 执行数据库迁移
echo "[3/5] 执行数据库迁移..."
npx prisma db push

# 4. 构建项目
echo "[4/5] 构建项目..."
npm run build

# 5. 使用 PM2 启动应用
echo "[5/5] 启动应用..."
pm2 delete wig-management 2>/dev/null || true
pm2 start npm --name "wig-management" -- start
pm2 save
pm2 startup

echo ""
echo "=== 部署完成 ==="
echo ""
echo "应用已启动，访问地址："
echo "  - http://sunnymayhair.cn"
echo "  - http://<ECS_IP>"
echo ""
echo "PM2 管理命令："
echo "  pm2 status          # 查看状态"
echo "  pm2 logs            # 查看日志"
echo "  pm2 restart wig-management  # 重启应用"
echo "  pm2 stop wig-management     # 停止应用"
echo ""

# 配置 SSL 证书（可选）
echo "配置 SSL 证书..."
read -p "是否配置 SSL 证书？(y/n): " setup_ssl
if [ "$setup_ssl" = "y" ]; then
    sudo certbot --nginx -d sunnymayhair.cn -d www.sunnymayhair.cn --agree-tos --non-interactive --email datou059899@gmail.com
    echo "SSL 证书配置完成"
fi

echo ""
echo "全部完成！"