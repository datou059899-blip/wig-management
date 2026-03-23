export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">测试页面</h1>
        <p className="text-gray-600">如果能看到这个页面，说明基础服务正常。</p>
        <p className="text-gray-500 text-sm mt-2">时间：{new Date().toLocaleString('zh-CN')}</p>
      </div>
    </div>
  )
}
