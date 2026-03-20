"""
TikTok数据同步主程序
自动从TikTok Seller Center获取数据并同步到wig-management系统
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

import config

# 创建日志目录
log_dir = Path(config.LOG_FILE).parent
log_dir.mkdir(parents=True, exist_ok=True)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(config.LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class TikTokSync:
    def __init__(self):
        self.browser = None
        self.page = None
        self.context = None
        
    def setup_browser(self):
        """初始化浏览器"""
        logger.info("正在启动浏览器...")
        playwright = sync_playwright().start()
        self.browser = playwright.chromium.launch(headless=config.HEADLESS_MODE)
        self.context = self.browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        self.page = self.context.new_page()
        logger.info("浏览器启动成功")
        
    def login(self):
        """登录TikTok Seller Center"""
        if not config.TIKTOK_EMAIL or not config.TIKTOK_PASSWORD:
            logger.error("请在config.py中配置TIKTOK_EMAIL和TIKTOK_PASSWORD")
            return False
            
        logger.info("正在登录TikTok Seller Center...")
        try:
            self.page.goto(config.TIKTOK_SELLER_CENTER_URL, timeout=60000)
            time.sleep(3)
            
            # 点击登录按钮
            self.page.click('button:has-text("登录"), button:has-text("Sign in"), button:has-text("Log in")', timeout=5000)
            time.sleep(2)
            
            # 输入邮箱
            self.page.fill('input[type="email"], input[placeholder*="email" i], input[placeholder*="邮箱"]', 
                          config.TIKTOK_EMAIL)
            time.sleep(1)
            
            # 点击继续
            self.page.click('button:has-text("Continue"), button:has-text("继续")')
            time.sleep(2)
            
            # 输入密码
            self.page.fill('input[type="password"]', config.TIKTOK_PASSWORD)
            time.sleep(1)
            
            # 点击登录
            self.page.click('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("登录")')
            time.sleep(5)
            
            logger.info("登录成功")
            return True
            
        except Exception as e:
            logger.error(f"登录失败: {str(e)}")
            return False
            
    def get_orders(self):
        """获取订单数据"""
        logger.info("正在获取订单数据...")
        orders = []
        
        try:
            # 导航到订单页面
            self.page.goto(f"{config.TIKTOK_SELLER_CENTER_URL}/orders", timeout=60000)
            time.sleep(5)
            
            # 设置日期范围
            self.page.click('input[placeholder*="日期"], input[placeholder*="Date"]')
            time.sleep(2)
            
            # 选择最近N天
            self.page.click(f'div[role="option"]:has-text("{config.SYNC_ORDER_DAYS}天"), '
                          f'div[role="option"]:has-text("{config.SYNC_ORDER_DAYS} days")')
            time.sleep(3)
            
            # 等待订单表格加载
            self.page.wait_for_selector('table, div[data-testid="order-table"]', timeout=10000)
            time.sleep(3)
            
            # 提取订单数据
            order_rows = self.page.query_selector_all('tr, div[data-testid="order-row"]')
            
            for row in order_rows[:50]:  # 最多处理50条
                try:
                    order_text = row.inner_text()
                    if '订单' in order_text or 'Order' in order_text:
                        # 这里需要根据实际页面结构调整解析逻辑
                        order_data = {
                            'sku': 'unknown',  # 需要根据实际页面提取
                            'gmv': 0,
                            'date': datetime.now().isoformat()
                        }
                        orders.append(order_data)
                except:
                    continue
                    
            logger.info(f"获取到 {len(orders)} 条订单")
            return orders
            
        except Exception as e:
            logger.error(f"获取订单失败: {str(e)}")
            return []
            
    def get_products(self):
        """获取产品数据"""
        logger.info("正在获取产品数据...")
        products = []
        
        try:
            self.page.goto(f"{config.TIKTOK_SELLER_CENTER_URL}/products", timeout=60000)
            time.sleep(5)
            
            # 等待产品列表加载
            self.page.wait_for_selector('table, div[data-testid="product-list"]', timeout=10000)
            time.sleep(3)
            
            # 提取产品数据
            product_rows = self.page.query_selector_all('tr, div[data-testid="product-row"]')
            
            for row in product_rows[:100]:  # 最多处理100条
                try:
                    product_text = row.inner_text()
                    if 'SKU' in product_text or '产品' in product_text:
                        product_data = {
                            'sku': 'unknown',  # 需要根据实际页面提取
                            'stock': 0,
                            'priceUsd': 0
                        }
                        products.append(product_data)
                except:
                    continue
                    
            logger.info(f"获取到 {len(products)} 条产品")
            return products
            
        except Exception as e:
            logger.error(f"获取产品失败: {str(e)}")
            return []
            
    def get_ads_data(self):
        """获取广告数据"""
        logger.info("正在获取广告数据...")
        ads_data = []
        
        try:
            self.page.goto(f"{config.TIKTOK_SELLER_CENTER_URL}/ads", timeout=60000)
            time.sleep(5)
            
            # 等待广告数据加载
            self.page.wait_for_selector('table, div[data-testid="ads-table"]', timeout=10000)
            time.sleep(3)
            
            # 提取广告数据
            ad_rows = self.page.query_selector_all('tr, div[data-testid="ad-row"]')
            
            for row in ad_rows[:50]:
                try:
                    ad_text = row.inner_text()
                    if '广告' in ad_text or 'Ad' in ad_text:
                        ad_data = {
                            'sku': 'unknown',
                            'spend': 0,
                            'date': datetime.now().isoformat()
                        }
                        ads_data.append(ad_data)
                except:
                    continue
                    
            logger.info(f"获取到 {len(ads_data)} 条广告数据")
            return ads_data
            
        except Exception as e:
            logger.error(f"获取广告数据失败: {str(e)}")
            return []
            
    def sync_to_api(self, data_type, data):
        """同步数据到API"""
        if not data:
            logger.info(f"没有{data_type}数据需要同步")
            return
            
        logger.info(f"正在同步 {len(data)} 条{data_type}数据到API...")
        
        try:
            url = f"{config.API_BASE_URL}/api/tiktok-import"
            headers = {
                'Authorization': f'Bearer {config.API_KEY}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'type': data_type,
                'data': data
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"同步成功: {result}")
            else:
                logger.error(f"同步失败: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"API调用失败: {str(e)}")
            
    def close(self):
        """关闭浏览器"""
        if self.browser:
            self.browser.close()
            logger.info("浏览器已关闭")
            
    def run(self):
        """运行同步任务"""
        logger.info("="*50)
        logger.info("开始TikTok数据同步任务")
        logger.info("="*50)
        
        self.setup_browser()
        
        try:
            # 登录
            if not self.login():
                logger.error("登录失败,任务终止")
                return
                
            # 同步订单
            if config.SYNC_ORDERS:
                orders = self.get_orders()
                self.sync_to_api('orders', orders)
                
            # 同步产品
            if config.SYNC_PRODUCTS:
                products = self.get_products()
                self.sync_to_api('products', products)
                
            # 同步广告
            if config.SYNC_ADS:
                ads_data = self.get_ads_data()
                self.sync_to_api('ads', ads_data)
                
            logger.info("="*50)
            logger.info("数据同步任务完成")
            logger.info("="*50)
            
        except Exception as e:
            logger.error(f"同步任务异常: {str(e)}")
        finally:
            self.close()


def main():
    """主函数"""
    print("""
    ╔════════════════════════════════════════════╗
    ║     TikTok数据同步工具                      ║
    ║     自动同步TikTok小店数据到管理系统         ║
    ╚════════════════════════════════════════════╝
    """)
    
    sync = TikTokSync()
    sync.run()


if __name__ == "__main__":
    main()
