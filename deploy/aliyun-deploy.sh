#!/bin/bash
# 阿里云 ECS 部署脚本
# 使用方法：在 ECS 上运行此脚本

set -e

echo "=== 开始部署 wig-management ==="

# 1. 安装 Node.js 20.x
echo "[1/8] 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v

# 2. 安装 PM2
echo "[2/8] 安装 PM2..."
sudo npm install -g pm2

# 3. 安装 Nginx
echo "[3/8] 安装 Nginx..."
sudo apt-get update
sudo apt-get install -y nginx

# 4. 创建应用目录
echo "[4/8] 创建应用目录..."
sudo mkdir -p /var/www/wig-management
sudo chown -R $USER:$USER /var/www/wig-management

# 5. 配置 Nginx
echo "[5/8] 配置 Nginx..."
sudo tee /etc/nginx/sites-available/wig-management << 'EOF'
server {
    listen 80;
    server_name sunnymayhair.cn www.sunnymayhair.cn;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/wig-management /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 6. 配置防火墙
echo "[6/8] 配置防火墙..."
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

# 7. 安装 Certbot（SSL 证书）
echo "[7/8] 安装 Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

echo ""
echo "=== 基础环境安装完成 ==="
echo ""
echo "下一步："
echo "1. 将项目代码上传到 /var/www/wig-management"
echo "2. 创建 .env 文件并配置数据库连接"
echo "3. 运行部署后配置脚本: ./deploy/post-deploy.sh"
echo ""
