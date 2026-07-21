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
  Loader2,
  Sparkles,
  CloudLightning,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Lock,
  Compass,
  FileText
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Kanban from './components/Kanban';
import Whiteboard from './components/Whiteboard';
import Diary from './components/Diary';
import ResourceLibrary from './components/ResourceLibrary';
import Search from './components/Search';
import StorageSync from './components/StorageSync';
import { db } from './db';
import { syncManager } from './syncManager';

export default function App() {
  // Database initialization state
  const [dbInitialized, setDbInitialized] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Theme selection state: 'dark' (Dark Professional), 'light' (Light Professional), 'colorful' (Colorful Modern)
  const [theme, setTheme] = useState<'dark' | 'light' | 'colorful'>(() => {
    return (localStorage.getItem('jnas_theme') as any) || 'dark';
  });

  // Sidebar collapse state
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('jnas_sidebar_collapsed');
    return saved === 'true' ? false : true;
  });

  // Sync state tracking from syncManager
  const [syncState, setSyncState] = useState(() => syncManager.getState());

  useEffect(() => {
    db.init()
      .then(() => {
        setDbInitialized(true);
      })
      .catch((err) => {
        console.error("Failed to initialize system database:", err);
        setDbError(err?.message || String(err));
      });

    // Subscribe to syncManager to get reactive status changes
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });

    return unsubscribe;
  }, []);

  // Sync database trigger to all sub-components on import events
  useEffect(() => {
    const handleDbUpdated = () => {
      triggerRefresh();
    };
    window.addEventListener('jnas_db_updated', handleDbUpdated);
    return () => window.removeEventListener('jnas_db_updated', handleDbUpdated);
  }, []);

  // Navigation & State
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  
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

  // Persists theme selection to localStorage
  const handleThemeChange = (newTheme: 'dark' | 'light' | 'colorful') => {
    setTheme(newTheme);
    localStorage.setItem('jnas_theme', newTheme);
  };

  // Persists sidebar collapse/expanded state
  const toggleSidebar = () => {
    const nextState = !isSidebarOpen;
    setIsSidebarOpen(nextState);
    localStorage.setItem('jnas_sidebar_collapsed', (!nextState).toString());
  };

  // Global manual save button handler
  const handleManualSave = async () => {
    try {
      await syncManager.syncNow();
    } catch (err) {
      console.error("Manual save sync failed:", err);
    }
  };

  // Formats last saved time
  const formatLastSavedTime = (isoString: string | null) => {
    if (!isoString) return 'Never';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return 'Never';
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'System Core', icon: LayoutDashboard, desc: 'Overview & Quick actions' },
    { id: 'diary', label: 'Journal Stream', icon: BookOpen, desc: 'Daily logs & timelines' },
    { id: 'kanban', label: 'Kanban Pipelines', icon: Trello, desc: 'Agile sprints & boards' },
    { id: 'whiteboard', label: 'Infinite Vectors', icon: Palette, desc: 'Collaborative canvases' },
    { id: 'resources', label: 'Asset Catalog', icon: Link2, desc: 'Bookmarks & file links' },
    { id: 'search', label: 'Global Scanner', icon: SearchIcon, desc: 'Universal workspace indexing' },
    { id: 'storage', label: 'Storage Sync', icon: Database, desc: 'Multi-device sync' },
  ];

  // Map modules to descriptive header labels
  const moduleDetails: Record<string, { title: string; subtitle: string; icon: any }> = {
    dashboard: { title: 'System Core', subtitle: 'Workspace Dashboard Metrics', icon: LayoutDashboard },
    diary: { title: 'Journal Stream', subtitle: 'Timeline Logs & Daily Entries', icon: BookOpen },
    kanban: { title: 'Kanban Pipelines', subtitle: 'Sprint Tasks & Backlogs', icon: Trello },
    whiteboard: { title: 'Infinite Vectors', subtitle: 'Interactive Vector Design Canvas', icon: Palette },
    resources: { title: 'Asset Catalog', subtitle: 'Resource References & Bookmarks', icon: Link2 },
    search: { title: 'Global Scanner', subtitle: 'Workspace Query indexing Engine', icon: SearchIcon },
    storage: { title: 'Storage Sync', subtitle: 'Security Credentials & Multi-Device Sync', icon: Database }
  };

  if (dbError) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 bg-[#06080F] text-slate-100`}>
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#06080F] text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg animate-pulse">
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

  // Active Theme styling configurations
  const themeContainerClass = 
    theme === 'dark' ? 'bg-[#06080F] text-slate-100' :
    theme === 'light' ? 'bg-[#F8FAFC] text-slate-900' :
    'bg-[#0a0514] text-[#ede5fa]';

  const asideClass =
    theme === 'dark' ? 'bg-[#090D16] border-[#161D30] text-slate-100' :
    theme === 'light' ? 'bg-white border-slate-200 text-slate-800' :
    'bg-[#0d071b] border-[#22123b] text-[#ede5fa]';

  const activeNavClass =
    theme === 'dark' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 font-bold' :
    theme === 'light' ? 'bg-blue-50 text-blue-600 border border-blue-200 font-bold' :
    'bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-bold';

  const hoverNavClass =
    theme === 'dark' ? 'text-slate-400 hover:bg-slate-900/40 hover:text-white' :
    theme === 'light' ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900' :
    'text-[#bca4e6] hover:bg-[#1a0f32]/40 hover:text-white';

  const footerClass =
    theme === 'dark' ? 'border-[#161D30]' :
    theme === 'light' ? 'border-slate-150' :
    'border-[#22123b]';

  const currentModule = moduleDetails[activeModule] || moduleDetails['dashboard'];
  const HeaderIcon = currentModule.icon;

  return (
    <div className={`min-h-screen flex transition-colors duration-300 font-sans ${themeContainerClass}`}>
      
      {/* 1. Mobile Sidebar Hamburger Trigger (Overlaid nicely) */}
      <div className="md:hidden fixed top-4 left-4 z-40">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`p-2.5 rounded-xl border shadow-md transition cursor-pointer ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' :
            theme === 'light' ? 'bg-white border-slate-200 text-slate-800' :
            'bg-[#1a0f32] border-[#2c1c4e] text-white'
          }`}
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* 2. Redesigned Premium Side Navigation Panel */}
      <aside className={`fixed md:sticky top-0 bottom-0 left-0 z-30 transition-all duration-300 flex flex-col shrink-0 ${
        isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0 md:w-20'
      } ${asideClass}`}>
        
        {/* Workspace Brand Header */}
        <div className={`h-16 flex items-center justify-between px-6 border-b ${footerClass}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={`p-2 rounded-xl text-white shadow-sm shrink-0 bg-gradient-to-tr ${
              theme === 'colorful' ? 'from-fuchsia-500 to-indigo-600' : 'from-blue-600 to-indigo-600'
            }`}>
              <Terminal className="w-4 h-4" />
            </div>
            {isSidebarOpen && (
              <div className="text-left">
                <span className="font-bold text-xs tracking-tight block">JNAS Workspace</span>
                <span className="text-[9px] font-mono text-emerald-500 uppercase font-semibold">Local-First OS</span>
              </div>
            )}
          </div>

          {/* Minimize/Maximize trigger on Desktop */}
          <button
            onClick={toggleSidebar}
            className={`hidden md:block p-1.5 hover:bg-slate-800/10 rounded-lg transition shrink-0 cursor-pointer ${
              theme === 'light' ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Menu className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = activeModule === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition cursor-pointer text-left text-xs border border-transparent ${
                  isActive ? activeNavClass : hoverNavClass
                }`}
              >
                <Icon className={`w-4.5 h-4.5 shrink-0`} />
                {isSidebarOpen && (
                  <div className="flex flex-col">
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-[9px] opacity-40 font-normal line-clamp-1">{item.desc}</span>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Controls with custom details */}
        <div className={`p-4 border-t space-y-3 ${footerClass}`}>
          {isSidebarOpen && (
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 px-2 select-none">
              <span>SYSTEM CORE: v1.1.2</span>
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                Local Secure
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* 3. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Global Minimalist Top Header Bar */}
        <header className={`h-16 border-b px-6 flex items-center justify-between shrink-0 z-20 transition-all duration-300 ${
          theme === 'dark' ? 'bg-[#090D16]/80 border-[#161D30] backdrop-blur-md' :
          theme === 'light' ? 'bg-white/80 border-slate-200 backdrop-blur-md' :
          'bg-[#0d071b]/80 border-[#22123b] backdrop-blur-md'
        }`}>
          {/* Left Side: Module Labeling */}
          <div className="flex items-center gap-3 md:pl-0 pl-14">
            <div className={`p-1.5 rounded-lg border hidden md:block ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800 text-blue-400' :
              theme === 'light' ? 'bg-slate-50 border-slate-150 text-blue-600' :
              'bg-[#1a0f32] border-[#2c1c4e] text-fuchsia-400'
            }`}>
              <HeaderIcon className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h1 className="text-xs font-bold tracking-tight">{currentModule.title}</h1>
              <p className="text-[10px] opacity-40 font-medium hidden sm:block">{currentModule.subtitle}</p>
            </div>
          </div>

          {/* Right Side: Theme switcher, Save button, Sync status */}
          <div className="flex items-center gap-3">
            
            {/* Dynamic Save Button (Synchronizer Trigger) */}
            <div className="flex flex-col items-end">
              <button
                onClick={handleManualSave}
                disabled={syncState.status === 'syncing'}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 shadow-sm border ${
                  syncState.status === 'syncing'
                    ? (theme === 'light' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800')
                    : syncState.status === 'error'
                    ? 'bg-rose-950/20 text-rose-400 border-rose-900/30'
                    : syncState.status === 'offline'
                    ? 'bg-slate-950/30 text-slate-500 border-slate-900'
                    : 'bg-emerald-950/10 hover:bg-emerald-950/20 text-emerald-400 border-emerald-900/20'
                }`}
              >
                {syncState.status === 'syncing' ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                    <span>Saving...</span>
                  </>
                ) : syncState.status === 'error' ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    <span>Save Failed</span>
                  </>
                ) : syncState.status === 'offline' ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    <span>Saved Local</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span>Saved ✓</span>
                  </>
                )}
              </button>
              
              {/* Last Saved Timestamp Label */}
              <span className="text-[8px] font-mono text-slate-500 mt-1">
                Last Saved: {formatLastSavedTime(syncState.lastSyncedAt)}
              </span>
            </div>

            <div className="w-px h-5 bg-slate-800/60" />

            {/* Premium Minimalist Theme Switcher */}
            <div className={`flex border rounded-lg overflow-hidden p-0.5 font-mono ${
              theme === 'dark' ? 'bg-slate-950 border-slate-850' :
              theme === 'light' ? 'bg-slate-50 border-slate-200' :
              'bg-[#1a0f32] border-[#2c1c4e]'
            }`}>
              <button 
                onClick={() => handleThemeChange('dark')}
                title="Dark Professional theme"
                className={`p-1 rounded cursor-pointer transition ${
                  theme === 'dark' ? 'bg-blue-600/25 text-blue-400 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Moon className="w-3 h-3" />
              </button>
              <button 
                onClick={() => handleThemeChange('light')}
                title="Light Professional theme"
                className={`p-1 rounded cursor-pointer transition ${
                  theme === 'light' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Sun className="w-3 h-3" />
              </button>
              <button 
                onClick={() => handleThemeChange('colorful')}
                title="Colorful Modern theme"
                className={`p-1 rounded cursor-pointer transition ${
                  theme === 'colorful' ? 'bg-fuchsia-600/30 text-fuchsia-400 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3" />
              </button>
            </div>

          </div>
        </header>

        {/* Scrollable module panel container */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto no-scrollbar">
          
          {/* Active Module Router */}
          {activeModule === 'dashboard' && (
            <Dashboard 
              darkMode={theme !== 'light'} 
              onNavigate={handleNavClick} 
              triggerRefresh={refreshCounter} 
            />
          )}

          {activeModule === 'diary' && (
            <Diary 
              darkMode={theme !== 'light'} 
              triggerRefresh={triggerRefresh} 
            />
          )}

          {activeModule === 'kanban' && (
            <Kanban 
              darkMode={theme !== 'light'} 
              triggerRefresh={triggerRefresh} 
            />
          )}

          {activeModule === 'whiteboard' && (
            <Whiteboard 
              darkMode={theme !== 'light'} 
              triggerRefresh={triggerRefresh} 
              activeItemId={activeItemId}
            />
          )}

          {activeModule === 'resources' && (
            <ResourceLibrary 
              darkMode={theme !== 'light'} 
              triggerRefresh={triggerRefresh} 
            />
          )}

          {activeModule === 'search' && (
            <Search 
              darkMode={theme !== 'light'} 
              onNavigateToItem={handleNavigateToItem} 
            />
          )}

          {activeModule === 'storage' && (
            <StorageSync 
              darkMode={theme !== 'light'} 
              triggerRefresh={triggerRefresh} 
            />
          )}

        </div>
      </main>

    </div>
  );
}
