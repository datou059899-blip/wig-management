# 数据库备份指南

## 快速使用

### 每周备份
```bash
npm run backup:data
```

### 部署前备份
```bash
npm run backup:data
# 确认备份成功后
npm run build
# 或部署到 Vercel
```

## 备份内容

当前备份脚本 `backup-data.js` 会备份以下表：

| 表名 | 说明 |
|------|------|
| User | 用户账号 |
| Product | 产品信息 |
| Influencer | 达人信息 |
| WorkTask | 工作台任务 |
| Config | 系统配置 |
| TrainingTask | 培训任务 |
| ProductOpportunity | 产品机会 |
| InfluencerSampleShipment | 达人寄样记录 |
| InfluencerSampleItem | 寄样商品明细 |
| ViralScript | 爆款脚本 |
| ScriptBreakdown | 脚本拆解 |
| ScriptUserAnalysis | 用户脚本分析 |
| PerformanceDaily | 经营数据日报 |
| PerformanceMeta | 经营数据元信息 |
| ViralVideoAnalysis | 爆款视频分析 |
| OwnVideoMetric | 自有视频数据 |

## 备份文件位置

备份文件统一输出到 `backup/` 目录，文件名格式：
```
backup/backup_YYYY-MM-DD_HH-mm-ss.json
```

## 恢复备份

```bash
# 1. 查看备份文件
ls -la backup/

# 2. 使用恢复脚本（如果需要）
node restore-data.js backup/backup_2026-04-27_12-00-00.json
```

## 自动化建议

### 设置定时备份 (macOS/Linux)
```bash
# 编辑 crontab
crontab -e

# 添加每周日凌晨3点备份
0 3 * * 0 cd /Users/yuyuhan/Desktop/dev/wig-management && npm run backup:data
```

### GitHub Actions 自动备份
可以在 `.github/workflows/backup.yml` 中配置定时备份到云存储。

## 注意事项

1. **备份频率**: 建议每周至少备份一次
2. **部署前**: 重大变更前务必先备份
3. **存储位置**: 备份文件在 `backup/` 目录，建议定期下载到本地或云存储
4. **敏感数据**: 备份文件包含数据库完整内容，请妥善保管
