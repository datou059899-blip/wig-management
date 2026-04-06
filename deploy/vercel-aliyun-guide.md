# Vercel + 阿里云域名部署指南（免费方案）

## 方案概述

使用 Vercel 免费托管 + 阿里云域名 + 阿里云 CDN 国内加速，实现国内外都能访问。

```
用户（国内）-> 阿里云 CDN -> Vercel（海外）
用户（国外）-> Vercel（海外）
```

## 费用

| 项目 | 费用 |
|------|------|
| Vercel 托管 | 免费 |
| Vercel Postgres | 免费（60小时/月）|
| 阿里云域名 | 已购买 |
| 阿里云 CDN | 免费额度（10GB/月）|
| **总计** | **基本免费** |

---

## 步骤 1：配置 Vercel 自定义域名

1. 访问 https://vercel.com/dashboard
2. 进入 wig-management 项目
3. 点击 **Settings** -> **Domains**
4. 添加域名：`sunnymayhair.cn`
5. 记录 Vercel 提供的 DNS 记录（通常是 CNAME）

---

## 步骤 2：配置阿里云域名解析

1. 访问 https://dc.console.aliyun.com/
2. 找到 `sunnymayhair.cn`
3. 点击 **解析设置**
4. 添加 CNAME 记录：
   - **主机记录**：`@`
   - **记录类型**：CNAME
   - **记录值**：`cname.vercel-dns.com`（以 Vercel 提供的为准）
   - **TTL**：600

---

## 步骤 3：配置 Vercel Postgres（免费数据库）

1. 在 Vercel 项目页面，点击 **Storage**
2. 选择 **Create Database** -> **Postgres**
3. 选择 **Free Tier**
4. 创建后，点击 **Connect**
5. 在 **Settings** -> **Environment Variables** 中添加：
   - `DATABASE_URL` = 连接字符串
   - `NEXTAUTH_URL` = `https://sunnymayhair.cn`

---

## 步骤 4：配置阿里云 CDN（国内加速）

1. 访问 https://cdn.console.aliyun.com/
2. 点击 **域名管理** -> **添加域名**
3. 配置：
   - **加速域名**：`sunnymayhair.cn`
   - **业务类型**：全站加速
   - **源站信息**：
     - 类型：源站域名
     - 地址：你的 Vercel 域名（如 `wig-management-xxx.vercel.app`）
4. 等待 CDN 配置完成
5. 在阿里云域名解析中，将记录值改为 CDN 提供的 CNAME

---

## 步骤 5：重新部署

```bash
cd /Users/yuyuhan/Desktop/dev/wig-management

# 部署到生产环境
npx vercel --prod
```

---

## 验证

1. 访问 https://sunnymayhair.cn
2. 国内用户通过 CDN 加速访问
3. 国外用户直接访问 Vercel

---

## 故障排查

### 域名无法访问
- 检查域名解析是否生效：`nslookup sunnymayhair.cn`
- 检查 Vercel 域名配置是否正确

### 数据库连接失败
- 检查 `DATABASE_URL` 环境变量
- 确认 Vercel Postgres 状态正常

### CDN 不生效
- 检查 CDN 域名状态是否为"正常运行"
- 清除 CDN 缓存