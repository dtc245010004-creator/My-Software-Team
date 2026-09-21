import React from 'react'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-lg shadow-blue-500/30">
          📦
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Hệ Thống Quản Lý Kho Tích Hợp AI
        </h1>
        <p className="text-slate-500 text-sm mb-6">
          Đề tài 07: Quản lý hàng hóa, phiếu nhập/xuất, thẻ kho và trợ lý AI thông minh.
        </p>

        <div className="grid grid-cols-2 gap-3 text-left mb-6">
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block mb-1">Backend</span>
            <span className="text-sm font-medium text-slate-700">FastAPI & SQLite</span>
          </div>
          <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
            <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider block mb-1">Frontend</span>
            <span className="text-sm font-medium text-slate-700">React & Vite</span>
          </div>
          <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block mb-1">AI Engine</span>
            <span className="text-sm font-medium text-slate-700">Gemini & Fallback</span>
          </div>
          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block mb-1">Status</span>
            <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Scaffolding Ready
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Khung dự án đã sẵn sàng để triển khai các phân hệ theo tài liệu SDLC.
        </p>
      </div>
    </div>
  )
}
