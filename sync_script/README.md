# TikTok数据同步系统使用说明

## 📋 概述

本系统用于自动将TikTok美国小店的数据同步到wig-management管理系统,实现订单、产品、广告数据的自动化更新。

---

## 🚀 快速开始

### 第一步: 部署API到Vercel

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 生成Prisma客户端
npx prisma generate

# 3. 部署到Vercel
vercel deploy --prod
```

**注意**: 首次部署需要在Vercel后台设置环境变量:
- `TIKTOK_SYNC_API_KEY`: 设置一个安全的API密钥

---

### 第二步: 配置Windows同步电脑

1. **复制同步文件夹**  
   将 `sync_script` 文件夹复制到你的Windows电脑上

2. **修改配置文件**  
   编辑 `config.py`,填入以下信息:
   ```python
   # API配置
   API_KEY = "你在Vercel设置的API密钥"
   
   # TikTok登录信息
   TIKTOK_EMAIL = "你的TikTok账号邮箱"
   TIKTOK_PASSWORD = "你的TikTok账号密码"
   ```

3. **双击运行**  
   - 首次运行: 双击 `启动同步.bat`
   - 脚本会自动安装依赖和浏览器
   - 观察命令行窗口,确认登录和数据同步是否成功

4. **设置定时任务(可选)**  
   双击 `设置定时任务.bat`,设置每小时自动同步

---

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `config.py` | 配置文件,修改API密钥和TikTok账号 |
| `sync.py` | 同步主程序 |
| `requirements.txt` | Python依赖 |
| `启动同步.bat` | 一键启动同步(带界面) |
| `设置定时任务.bat` | 设置Windows定时任务 |
| `logs/sync.log` | 同步日志文件 |

---

## ⚙️ 配置说明

### config.py 配置项

```python
# API配置
API_BASE_URL = "https://wig-management-olive.vercel.app"  # 你的网站地址
API_KEY = "your-tiktok-sync-api-key"  # API密钥

# TikTok Seller Center (美国站点)
TIKTOK_SELLER_CENTER_URL = "https://seller-uss.tiktok.com"
TIKTOK_EMAIL = ""  # 填入你的账号
TIKTOK_PASSWORD = ""  # 填入你的密码

# 同步设置
SYNC_INTERVAL_HOURS = 1  # 定时任务间隔(小时)
SYNC_ORDER_DAYS = 1  # 同步最近几天的订单
HEADLESS_MODE = True  # 无头模式(True=不显示浏览器)

# 数据类型开关
SYNC_ORDERS = True    # 同步订单
SYNC_PRODUCTS = True  # 同步产品
SYNC_ADS = True       # 同步广告数据
```

---

## 🔧 手动测试同步

1. **测试API连接**
   ```bash
   # 在命令行中测试
   curl -X POST https://wig-management-olive.vercel.app/api/tiktok-import \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"type":"orders","data":[]}'
   ```

2. **运行同步脚本**
   ```bash
   cd sync_script
   python sync.py
   ```

3. **查看日志**
   - 同步过程日志: `logs/sync.log`
   - Vercel日志: Vercel后台 → Dashboard → Function Logs

---

## ⚠️ 注意事项

1. **TikTok登录**: 首次运行需要手动登录TikTok Seller Center,脚本会自动保存cookies

2. **验证码**: 如果TikTok要求验证码,可能需要手动处理一次登录

3. **数据格式**: Python脚本提取数据的方式可能需要根据TikTok Seller Center的实际页面结构调整

4. **API安全**: 
   - 定期更换API密钥
   - 不要将API密钥分享给他人

---

## 🔄 数据同步说明

同步的数据将保存到以下位置:

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| 订单数据 | PerformanceDaily表 | GMV、订单数 |
| 产品数据 | TiktokSync表 | 库存、价格、状态 |
| 广告数据 | PerformanceDaily表 | 广告花费 |

你可以在wig-management系统的"绩效管理"页面查看同步的数据。

---

## 🛠️ 故障排除

### 问题1: 登录失败
- 检查 `config.py` 中的账号密码是否正确
- 尝试将 `HEADLESS_MODE` 改为 `False` 查看浏览器操作

### 问题2: API调用失败
- 确认API密钥配置正确
- 检查Vercel后台的Function Logs
- 确认网络可以访问Vercel

### 问题3: 定时任务不执行
- 确认Python路径正确
- 检查Windows任务计划程序中任务状态
- 尝试以管理员身份运行设置脚本

---

## 📞 支持

如有问题,请检查:
1. `logs/sync.log` 日志文件
2. Vercel后台的Function Logs
3. Windows任务计划程序状态

---

*最后更新: 2026-03-20*
