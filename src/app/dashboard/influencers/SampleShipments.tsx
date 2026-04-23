'use client'

import { useState, useEffect, useCallback } from 'react'

interface SampleItem {
  id: string
  productId?: string
  sku?: string
  productName: string
  color?: string
  length?: string
  quantity: number
}

interface SampleShipment {
  id: string
  sampleRound: number
  sampleDate?: string
  status: 'pending' | 'shipped' | 'delivered' | 'feedback'
  trackingNumber?: string
  notes?: string
  createdBy: string
  createdAt: string
  items: SampleItem[]
}

interface SampleShipmentsProps {
  influencerId: string
  canManage?: boolean
}

const statusLabel: Record<string, string> = {
  pending: '待寄',
  shipped: '已寄出',
  delivered: '已签收',
  feedback: '已反馈',
}

const statusTone: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 border-gray-200',
  shipped: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  feedback: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default function SampleShipments({ influencerId, canManage }: SampleShipmentsProps) {
  const [shipments, setShipments] = useState<SampleShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // 新增寄样表单
  const [isAdding, setIsAdding] = useState(false)
  const [newShipment, setNewShipment] = useState<{
    sampleDate: string
    status: string
    trackingNumber: string
    notes: string
    items: { productName: string; sku: string; color: string; length: string; quantity: number }[]
  }>({
    sampleDate: new Date().toISOString().slice(0, 16),
    status: 'pending',
    trackingNumber: '',
    notes: '',
    items: [{ productName: '', sku: '', color: '', length: '', quantity: 1 }],
  })

  const loadShipments = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/influencers/${influencerId}/shipments`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '加载失败')
      setShipments(data.shipments || [])
    } catch (e: any) {
      setError(e.message || '加载寄样记录失败')
    } finally {
      setLoading(false)
    }
  }, [influencerId])

  useEffect(() => {
    loadShipments()
  }, [loadShipments])

  const handleAddItem = () => {
    setNewShipment((prev) => ({
      ...prev,
      items: [...prev.items, { productName: '', sku: '', color: '', length: '', quantity: 1 }],
    }))
  }

  const handleRemoveItem = (index: number) => {
    setNewShipment((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  const handleItemChange = (index: number, field: string, value: string | number) => {
    setNewShipment((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }))
  }

  const handleSubmit = async () => {
    try {
      // 验证
      if (newShipment.items.some((item) => !item.productName.trim())) {
        setError('请填写产品名称')
        return
      }

      const res = await fetch(`/api/influencers/${influencerId}/shipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleDate: newShipment.sampleDate,
          status: newShipment.status,
          trackingNumber: newShipment.trackingNumber || undefined,
          notes: newShipment.notes || undefined,
          items: newShipment.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity) || 1,
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '创建失败')

      // 重置表单
      setNewShipment({
        sampleDate: new Date().toISOString().slice(0, 16),
        status: 'pending',
        trackingNumber: '',
        notes: '',
        items: [{ productName: '', sku: '', color: '', length: '', quantity: 1 }],
      })
      setIsAdding(false)
      setError('')
      
      // 重新加载
      await loadShipments()
    } catch (e: any) {
      setError(e.message || '创建寄样记录失败')
    }
  }

  if (loading) {
    return <div className="text-xs text-gray-500 py-2">加载中...</div>
  }

  return (
    <div className="space-y-3">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-900">
          寄样记录
          <span className="ml-2 text-[11px] font-normal text-gray-500">
            共 {shipments.length} 次
          </span>
        </div>
        {canManage && (
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-2.5 py-1.5 text-[11px] rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            {isAdding ? '取消' : '新增寄样'}
          </button>
        )}
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {/* 新增表单 */}
      {isAdding && (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-gray-600 mb-1">寄样日期</div>
              <input
                type="datetime-local"
                value={newShipment.sampleDate}
                onChange={(e) => setNewShipment((prev) => ({ ...prev, sampleDate: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded"
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-600 mb-1">状态</div>
              <select
                value={newShipment.status}
                onChange={(e) => setNewShipment((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded"
              >
                <option value="pending">待寄</option>
                <option value="shipped">已寄出</option>
                <option value="delivered">已签收</option>
                <option value="feedback">已反馈</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-gray-600 mb-1">快递单号</div>
            <input
              value={newShipment.trackingNumber}
              onChange={(e) => setNewShipment((prev) => ({ ...prev, trackingNumber: e.target.value }))}
              placeholder="例如：DHL-1234567890"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded"
            />
          </div>

          <div>
            <div className="text-[11px] text-gray-600 mb-1">备注</div>
            <textarea
              value={newShipment.notes}
              onChange={(e) => setNewShipment((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="寄样备注信息..."
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded min-h-[50px]"
            />
          </div>

          {/* 产品明细 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-gray-700">产品明细</div>
              <button
                onClick={handleAddItem}
                className="text-[11px] text-primary-600 hover:text-primary-700"
              >
                + 添加产品
              </button>
            </div>
            <div className="space-y-2">
              {newShipment.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <div className="text-[10px] text-gray-500 mb-0.5">产品名称 *</div>
                    <input
                      value={item.productName}
                      onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                      placeholder="产品名称"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">SKU</div>
                    <input
                      value={item.sku}
                      onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                      placeholder="SKU"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">颜色</div>
                    <input
                      value={item.color}
                      onChange={(e) => handleItemChange(index, 'color', e.target.value)}
                      placeholder="颜色"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">长度</div>
                    <input
                      value={item.length}
                      onChange={(e) => handleItemChange(index, 'length', e.target.value)}
                      placeholder="长度"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">数量</div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
                    />
                  </div>
                  <div className="col-span-1">
                    {newShipment.items.length > 1 && (
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-[11px] text-red-500 hover:text-red-600"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              保存寄样记录
            </button>
          </div>
        </div>
      )}

      {/* 寄样记录列表 */}
      <div className="space-y-2">
        {shipments.length === 0 ? (
          <div className="text-[11px] text-gray-500 py-2">暂无寄样记录</div>
        ) : (
          shipments.map((shipment) => (
            <div
              key={shipment.id}
              className="border border-gray-100 rounded-lg p-3 bg-white"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-900">
                    第 {shipment.sampleRound} 次寄样
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[10px] ${
                      statusTone[shipment.status] || statusTone.pending
                    }`}
                  >
                    {statusLabel[shipment.status] || shipment.status}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">
                  {shipment.sampleDate
                    ? new Date(shipment.sampleDate).toLocaleDateString('zh-CN')
                    : '未设置日期'}
                </div>
              </div>

              {shipment.trackingNumber && (
                <div className="text-[11px] text-gray-600 mb-1">
                  快递单号：{shipment.trackingNumber}
                </div>
              )}

              {shipment.notes && (
                <div className="text-[11px] text-gray-600 mb-2">备注：{shipment.notes}</div>
              )}

              {/* 产品明细 */}
              {shipment.items.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] text-gray-500 mb-1">产品明细：</div>
                  <div className="space-y-1">
                    {shipment.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 text-[11px] text-gray-700 bg-gray-50 px-2 py-1 rounded"
                      >
                        <span className="font-medium">{item.productName}</span>
                        {item.sku && <span className="text-gray-500">({item.sku})</span>}
                        {item.color && <span className="text-gray-500">{item.color}</span>}
                        {item.length && <span className="text-gray-500">{item.length}</span>}
                        <span className="ml-auto text-primary-600">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 text-[10px] text-gray-400">
                记录人：{shipment.createdBy} ·{' '}
                {new Date(shipment.createdAt).toLocaleDateString('zh-CN')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
