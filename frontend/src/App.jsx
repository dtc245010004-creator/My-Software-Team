import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Navigation from './components/Navigation';

import Dashboard from './pages/Dashboard';
import Stations from './pages/Stations';
import Simulator from './pages/Simulator';
import Wallet from './pages/Wallet';
import Sessions from './pages/Sessions';
import AIAdvisor from './pages/AIAdvisor';
import Login from './pages/Login';

function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center font-mono text-xs text-steel-gray">
        Khởi tạo hệ thống điều phối EV CSMS...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-tech-white flex flex-col font-sans">
      <Header />
      <Navigation />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stations" element={<Stations />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/ai-advisor" element={<AIAdvisor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
