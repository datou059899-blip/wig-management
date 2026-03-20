"""
TikTok数据同步配置
"""

# API配置
API_BASE_URL = "https://wig-management-olive.vercel.app"
API_KEY = "123456"  # 需要在Vercel环境变量中设置相同的值

# TikTok Seller Center登录信息
TIKTOK_SELLER_CENTER_URL = "https://seller-uss.tiktok.com"
TIKTOK_EMAIL = ""  # 你的TikTok账号邮箱
TIKTOK_PASSWORD = ""  # 你的TikTok账号密码

# 同步设置
SYNC_INTERVAL_HOURS = 1  # 每隔多少小时同步一次
SYNC_ORDER_DAYS = 1  # 同步最近多少天的订单
HEADLESS_MODE = True  # 是否无头模式运行(True=不显示浏览器窗口)

# 数据类型开关
SYNC_ORDERS = True
SYNC_PRODUCTS = True
SYNC_ADS = True

# 日志设置
LOG_FILE = "logs/sync.log"
LOG_MAX_LINES = 1000
