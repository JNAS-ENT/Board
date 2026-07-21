import React, { useState, useEffect } from 'react';
import { 
  Trello, 
  BookOpen, 
  Palette, 
  Link2, 
  Search as SearchIcon, 
  Database, 
  Sun, 
  Moon, 
  Menu, 
  X,
  LayoutDashboard,
  Shield,
  HelpCircle,
  Terminal,
  Loader2
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Kanban from './components/Kanban';
import Whiteboard from './components/Whiteboard';
import Diary from './components/Diary';
import ResourceLibrary from './components/ResourceLibrary';
import Search from './components/Search';
import StorageSync from './components/StorageSync';
import { db } from './db';

export default function App() {
  // Database initialization state
  const [dbInitialized, setDbInitialized] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    db.init()
      .then(() => {
        setDbInitialized(true);
      })
      .catch((err) => {
        console.error("Failed to initialize system database:", err);
        setDbError(err?.message || String(err));
      });
  }, []);

  // Navigation & State
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  
  // Refresh Trigger to reload child component stats on any write
  const [refreshCounter, setRefreshCounter] = useState<number>(0);
  
  // Deep-linking parameters for direct navigation from Search
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeResourceTab, setActiveResourceTab] = useState<string | undefined>(undefined);

  const triggerRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };

  // Navigates and focuses a specific item (used by Global Search)
  const handleNavigateToItem = (module: string, itemId: string, extraTab?: string) => {
    setActiveItemId(itemId);
    setActiveResourceTab(extraTab);
    setActiveModule(module);
  };

  // Safe wrapper for navigation
  const handleNavClick = (module: string) => {
    setActiveItemId(null);
    setActiveResourceTab(undefined);
    setActiveModule(module);
    // Auto collapse sidebar on mobile
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'System Core', icon: LayoutDashboard, color: 'text-blue-500' },
    { id: 'diary', label: 'Journal Stream', icon: BookOpen, color: 'text-blue-500' },
    { id: 'kanban', label: 'Kanban Pipelines', icon: Trello, color: 'text-purple-500' },
    { id: 'whiteboard', label: 'Infinite Vectors', icon: Palette, color: 'text-amber-500' },
    { id: 'resources', label: 'Asset Catalog', icon: Link2, color: 'text-emerald-500' },
    { id: 'search', label: 'Global Scanner', icon: SearchIcon, color: 'text-amber-400' },
    { id: 'storage', label: 'Storage Sync', icon: Database, color: 'text-emerald-400' },
  ];

  if (dbError) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}>
        <div className="max-w-md text-center p-8 rounded-2xl border border-rose-500/20 bg-rose-500/5 shadow-xl">
          <span className="text-rose-500 text-3xl font-bold">⚠️</span>
          <h2 className="text-lg font-bold mt-4 mb-2">System Database Error</h2>
          <p className="text-sm opacity-70 mb-4">{dbError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium cursor-pointer transition shadow-md"
          >
            Retry Launch
          </button>
        </div>
      </div>
    );
  }

  if (!dbInitialized) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}>
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 text-white shadow-lg animate-pulse">
            <Terminal className="w-8 h-8" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="font-mono text-xs tracking-wider opacity-60">Initializing Secure Workspace Database...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex transition-colors duration-300 font-sans ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      
      {/* 1. Mobile Sidebar Hamburger Trigger */}
      <div className="md:hidden fixed top-4 left-4 z-40">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`p-2.5 rounded-xl border shadow-md transition cursor-pointer ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* 2. Side Navigation Panel */}
      <aside className={`fixed md:sticky top-0 bottom-0 left-0 z-30 w-72 border-r transition-all duration-300 flex flex-col shrink-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'
      } ${
        darkMode ? 'bg-slate-950 border-slate-900 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        {/* Workspace Brand Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-900">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 text-white shadow-sm shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            {isSidebarOpen && (
              <div className="text-left">
                <span className="font-bold text-sm tracking-tight block">JNAS Workspace</span>
                <span className="text-[9px] font-mono text-emerald-500 uppercase font-semibold">Local-First OS</span>
              </div>
            )}
          </div>

          {/* Minimize/Maximize trigger on Desktop */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden md:block p-1.5 hover:bg-slate-800/10 text-slate-400 hover:text-white rounded-lg transition shrink-0 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto scrollbar">
          {navItems.map((item) => {
            const isActive = activeModule === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition cursor-pointer text-left text-xs ${
                  isActive 
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 font-bold' 
                    : 'text-slate-400 hover:bg-slate-800/10 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-450'}`} />
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Controls: Dark/Light Mode toggle */}
        <div className="p-4 border-t border-slate-900 space-y-3">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs transition cursor-pointer ${
              darkMode ? 'bg-slate-900 border-slate-850 text-amber-400 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isSidebarOpen && <span>{darkMode ? 'Light Theme' : 'Dark Theme'}</span>}
            </div>
            {isSidebarOpen && <span className="font-mono text-[9px] opacity-40">toggle</span>}
          </button>

          {isSidebarOpen && (
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 px-2 select-none">
              <span>DB: v1.0.0</span>
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                Offline Secure
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* 3. Main Workbench Content Window */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Scrollable module panel container */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto scrollbar">
          
          {/* Active Module Router */}
          {activeModule === 'dashboard' && (
            <Dashboard 
              darkMode={darkMode} 
              onNavigate={handleNavClick} 
              triggerRefresh={refreshCounter} 
            />
          )}

          {activeModule === 'diary' && (
            <Diary 
              darkMode={darkMode} 
              triggerRefresh={triggerRefresh} 
            />
          )}

          {activeModule === 'kanban' && (
            <Kanban 
              darkMode={darkMode} 
              triggerRefresh={triggerRefresh} 
            />
          )}

          {activeModule === 'whiteboard' && (
            <Whiteboard 
              darkMode={darkMode} 
              triggerRefresh={triggerRefresh} 
              activeItemId={activeItemId}
            />
          )}

          {activeModule === 'resources' && (
            <ResourceLibrary 
              darkMode={darkMode} 
              triggerRefresh={triggerRefresh} 
            />
          )}

          {activeModule === 'search' && (
            <Search 
              darkMode={darkMode} 
              onNavigateToItem={handleNavigateToItem} 
            />
          )}

          {activeModule === 'storage' && (
            <StorageSync 
              darkMode={darkMode} 
              triggerRefresh={triggerRefresh} 
            />
          )}

        </div>
      </main>

    </div>
  );
}
