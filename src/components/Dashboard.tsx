import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Trello, 
  Palette, 
  Link2, 
  Code, 
  Plus, 
  Activity, 
  Clock, 
  Calendar as CalendarIcon,
  CheckCircle,
  FileCode,
  TrendingUp,
  Globe,
  Loader2
} from 'lucide-react';
import { DiaryEntry, KanbanCard, Resource, CodeSnippet, RecentActivity } from '../types';
import { db } from '../db';

interface DashboardProps {
  darkMode: boolean;
  onNavigate: (module: string) => void;
  triggerRefresh: number;
}

export default function Dashboard({ darkMode, onNavigate, triggerRefresh }: DashboardProps) {
  const [diaryCount, setDiaryCount] = useState(0);
  const [kanbanCards, setKanbanCards] = useState<KanbanCard[]>([]);
  const [resourcesCount, setResourcesCount] = useState(0);
  const [whiteboardCount, setWhiteboardCount] = useState(0);
  const [codeCount, setCodeCount] = useState(0);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  
  // Quick Log State
  const [quickLogText, setQuickLogText] = useState('');
  const [quickSnippetTitle, setQuickSnippetTitle] = useState('');
  const [quickSnippetCode, setQuickSnippetCode] = useState('');
  const [quickSnippetLang, setQuickSnippetLang] = useState('typescript');
  const [quickUrl, setQuickUrl] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Clock
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch metrics
  const fetchMetrics = async () => {
    try {
      const diaries = await db.getDiaryEntries();
      const cards = await db.getKanbanCards();
      const resources = await db.getResources();
      const wb = await db.getWhiteboardElements();
      const snippets = await db.getCodeSnippets();
      const acts = await db.getRecentActivities();

      setDiaryCount(diaries.length);
      setKanbanCards(cards);
      setResourcesCount(resources.length);
      setWhiteboardCount(wb.length);
      setCodeCount(snippets.length);
      setActivities(acts.slice(0, 8)); // Last 8 activities
    } catch (err) {
      console.error("Failed to load dashboard metrics:", err);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [triggerRefresh]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Quick Action Handler: Log Diary Entry
  const handleQuickLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLogText.trim()) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const datestamp = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      
      const newParagraph = `\n\n${datestamp} • ${timestamp}\n${quickLogText.trim()}`;
      
      const diaries = await db.getDiaryEntries();
      let targetEntry: DiaryEntry;

      if (diaries.length > 0) {
        // Append to the most recent entry
        const latest = diaries[0];
        targetEntry = {
          ...latest,
          content: latest.content + newParagraph,
          updatedAt: now.toISOString()
        };
      } else {
        // Create new entry
        targetEntry = {
          id: crypto.randomUUID(),
          title: 'Daily Stream logs',
          content: `# Daily Stream Logs\n\n${datestamp} • ${timestamp}\n${quickLogText.trim()}`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };
      }

      await db.saveDiaryEntry(targetEntry);
      setQuickLogText('');
      showSuccess('Logged successfully in Diary stream!');
      fetchMetrics();
    } catch (err) {
      console.error(err);
    }
  };

  // Quick Action Handler: Save Code Snippet
  const handleQuickSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSnippetTitle.trim() || !quickSnippetCode.trim()) return;

    try {
      const newSnippet: CodeSnippet = {
        id: crypto.randomUUID(),
        title: quickSnippetTitle.trim(),
        code: quickSnippetCode.trim(),
        language: quickSnippetLang,
        notes: 'Saved from Quick Actions dashboard.',
        createdAt: new Date().toISOString()
      };

      await db.saveCodeSnippet(newSnippet, 'create');
      setQuickSnippetTitle('');
      setQuickSnippetCode('');
      showSuccess('Code snippet cataloged!');
      fetchMetrics();
    } catch (err) {
      console.error(err);
    }
  };

  // Quick Action Handler: Bookmark Resource
  const handleQuickResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;

    setIsEnriching(true);
    try {
      // Clean up URL format
      let finalUrl = quickUrl.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }

      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl })
      });

      const data = await response.json();
      const meta = data.metadata || {
        title: finalUrl,
        category: 'url',
        description: 'Resource bookmarked. Standard description metadata.'
      };

      const newResource: Resource = {
        id: crypto.randomUUID(),
        title: meta.title,
        url: finalUrl,
        category: meta.category,
        notes: 'Quick clipped from Dashboard.',
        metadata: {
          description: meta.description,
          author: meta.author,
          language: meta.language,
          stars: meta.stars,
          videoDuration: meta.videoDuration
        },
        createdAt: new Date().toISOString()
      };

      await db.saveResource(newResource, 'create');
      setQuickUrl('');
      showSuccess('Resource meta-enriched and saved!');
      fetchMetrics();
    } catch (err) {
      console.error(err);
    } finally {
      setIsEnriching(false);
    }
  };

  // Kanban tasks stats
  const todoCount = kanbanCards.filter(c => c.columnId === 'todo').length;
  const progressCount = kanbanCards.filter(c => c.columnId === 'inprogress').length;
  const reviewCount = kanbanCards.filter(c => c.columnId === 'review').length;
  const completedCount = kanbanCards.filter(c => c.columnId === 'done').length;
  const totalTasks = kanbanCards.length;

  const getPercent = (count: number) => {
    if (totalTasks === 0) return 0;
    return Math.round((count / totalTasks) * 100);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-1 animate-fade-in">
      
      {/* Header Panel */}
      <div className={`p-6 rounded-2xl border transition shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Core Dashboard</h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Comprehensive local-first audit index and rapid actions terminal.
          </p>
        </div>
        
        {/* Real-time Clock */}
        <div className={`flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-mono border ${
          darkMode ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-slate-50 border-slate-200 text-emerald-600'
        }`}>
          <Clock className="w-4 h-4 animate-pulse" />
          <span>{time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span className="opacity-40">|</span>
          <span className="font-bold">{time.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Diaries */}
        <button 
          onClick={() => onNavigate('diary')}
          className={`p-5 rounded-xl border text-left transition hover:-translate-y-1 hover:shadow-md cursor-pointer ${
            darkMode ? 'bg-slate-900 border-slate-800 hover:border-blue-500/50' : 'bg-white border-slate-200 hover:border-blue-500/50'
          }`}
        >
          <div className="flex justify-between items-start text-blue-500">
            <BookOpen className="w-5 h-5" />
            <span className="text-xs font-mono font-medium opacity-60">DIARY</span>
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{diaryCount}</div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Paragraph Streams</p>
          </div>
        </button>

        {/* Kanban */}
        <button 
          onClick={() => onNavigate('kanban')}
          className={`p-5 rounded-xl border text-left transition hover:-translate-y-1 hover:shadow-md cursor-pointer ${
            darkMode ? 'bg-slate-900 border-slate-800 hover:border-purple-500/50' : 'bg-white border-slate-200 hover:border-purple-500/50'
          }`}
        >
          <div className="flex justify-between items-start text-purple-500">
            <Trello className="w-5 h-5" />
            <span className="text-xs font-mono font-medium opacity-60">KANBAN</span>
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              {progressCount + todoCount} <span className="text-xs font-normal opacity-50">/ {completedCount} done</span>
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active Backlog Tasks</p>
          </div>
        </button>

        {/* Whiteboard */}
        <button 
          onClick={() => onNavigate('whiteboard')}
          className={`p-5 rounded-xl border text-left transition hover:-translate-y-1 hover:shadow-md cursor-pointer ${
            darkMode ? 'bg-slate-900 border-slate-800 hover:border-amber-500/50' : 'bg-white border-slate-200 hover:border-amber-500/50'
          }`}
        >
          <div className="flex justify-between items-start text-amber-500">
            <Palette className="w-5 h-5" />
            <span className="text-xs font-mono font-medium opacity-60">WHITEBOARD</span>
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{whiteboardCount}</div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Canvas Vectors</p>
          </div>
        </button>

        {/* Resources */}
        <button 
          onClick={() => onNavigate('resources')}
          className={`p-5 rounded-xl border text-left transition hover:-translate-y-1 hover:shadow-md cursor-pointer ${
            darkMode ? 'bg-slate-900 border-slate-800 hover:border-emerald-500/50' : 'bg-white border-slate-200 hover:border-emerald-500/50'
          }`}
        >
          <div className="flex justify-between items-start text-emerald-500">
            <Link2 className="w-5 h-5" />
            <span className="text-xs font-mono font-medium opacity-60">RESOURCES</span>
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{resourcesCount}</div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Enriched Bookmarks</p>
          </div>
        </button>

        {/* Code Snippets */}
        <button 
          onClick={() => onNavigate('search')}
          className={`p-5 rounded-xl border text-left transition hover:-translate-y-1 hover:shadow-md cursor-pointer col-span-2 lg:col-span-1 ${
            darkMode ? 'bg-slate-900 border-slate-800 hover:border-pink-500/50' : 'bg-white border-slate-200 hover:border-pink-500/50'
          }`}
        >
          <div className="flex justify-between items-start text-pink-500">
            <Code className="w-5 h-5" />
            <span className="text-xs font-mono font-medium opacity-60">SNIPPETS</span>
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-mono font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{codeCount}</div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Syntax Highlighters</p>
          </div>
        </button>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm flex items-center gap-2 animate-fade-in font-sans">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Grid: Left Side (Recent Activity, Stats Visualization) & Right Side (Quick Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Progress Summary (Beautiful Custom SVG Chart) */}
          <div className={`p-6 rounded-2xl border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h2 className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              Workflow Task Distribution
            </h2>
            
            {totalTasks === 0 ? (
              <div className="py-8 text-center text-sm opacity-50">No backlog tasks. Create one in the Kanban screen!</div>
            ) : (
              <div className="mt-6 space-y-4">
                {/* Horizontal Progress bar block */}
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="w-20 truncate">To Do</span>
                  <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${getPercent(todoCount)}%` }}></div>
                  </div>
                  <span className="w-12 text-right">{todoCount} ({getPercent(todoCount)}%)</span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="w-20 truncate">In Progress</span>
                  <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${getPercent(progressCount)}%` }}></div>
                  </div>
                  <span className="w-12 text-right">{progressCount} ({getPercent(progressCount)}%)</span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="w-20 truncate">Review</span>
                  <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${getPercent(reviewCount)}%` }}></div>
                  </div>
                  <span className="w-12 text-right">{reviewCount} ({getPercent(reviewCount)}%)</span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="w-20 truncate">Completed</span>
                  <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${getPercent(completedCount)}%` }}></div>
                  </div>
                  <span className="w-12 text-right">{completedCount} ({getPercent(completedCount)}%)</span>
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity Audit Logs */}
          <div className={`p-6 rounded-2xl border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Live Workspace Activity Logs
            </h2>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Local-first reactive state mutations audit trail.
            </p>

            <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {activities.length === 0 ? (
                <div className="py-8 text-center text-sm opacity-50">No events logged yet. Make edits to generate live telemetry.</div>
              ) : (
                activities.map((act) => (
                  <div 
                    key={act.id} 
                    className={`p-3 rounded-xl border text-xs flex justify-between gap-4 items-start ${
                      darkMode ? 'bg-slate-950/60 border-slate-850' : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="flex gap-3 items-start">
                      <div className={`p-1.5 rounded-lg shrink-0 ${
                        act.type === 'diary' ? 'bg-blue-500/10 text-blue-400' :
                        act.type === 'kanban' ? 'bg-purple-500/10 text-purple-400' :
                        act.type === 'whiteboard' ? 'bg-amber-500/10 text-amber-400' :
                        act.type === 'resource' ? 'bg-emerald-500/10 text-emerald-400' :
                        'bg-pink-500/10 text-pink-400'
                      }`}>
                        {act.type === 'diary' && <BookOpen className="w-3.5 h-3.5" />}
                        {act.type === 'kanban' && <Trello className="w-3.5 h-3.5" />}
                        {act.type === 'whiteboard' && <Palette className="w-3.5 h-3.5" />}
                        {act.type === 'resource' && <Link2 className="w-3.5 h-3.5" />}
                        {act.type === 'code' && <Code className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] uppercase font-bold ${
                            act.action === 'create' ? 'bg-emerald-500/10 text-emerald-400' :
                            act.action === 'update' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-rose-500/10 text-rose-400'
                          }`}>
                            {act.action}
                          </span>
                          <span className={`${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{act.title}</span>
                        </div>
                        <p className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{act.details}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0 mt-0.5">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right column: Quick Actions console */}
        <div className="space-y-6">
          
          {/* Quick Diary Paragraph */}
          <div className={`p-6 rounded-2xl border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-500" />
              Stream Log Entry
            </h3>
            <p className={`text-xs mt-1 mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Write a sentence. It automatically gets added with today's timestamp to the active Diary entry.
            </p>

            <form onSubmit={handleQuickLog} className="space-y-3">
              <textarea
                value={quickLogText}
                onChange={(e) => setQuickLogText(e.target.value)}
                placeholder="e.g. Completed high-level database tests."
                rows={3}
                className={`w-full p-3 rounded-xl text-xs font-sans border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
              <button 
                type="submit"
                disabled={!quickLogText.trim()}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-medium cursor-pointer transition flex justify-center items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Append Stream Log
              </button>
            </form>
          </div>

          {/* Quick Resource clip */}
          <div className={`p-6 rounded-2xl border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-500" />
              Enrich & Clip Link
            </h3>
            <p className={`text-xs mt-1 mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Save a bookmark URL. Gemini AI will automatically pull its description, metadata, category, and tags server-side!
            </p>

            <form onSubmit={handleQuickResource} className="space-y-3">
              <input
                type="text"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                placeholder="e.g. github.com/shaikh-jnas"
                className={`w-full p-3 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
              <button 
                type="submit"
                disabled={!quickUrl.trim() || isEnriching}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-medium cursor-pointer transition flex justify-center items-center gap-2"
              >
                {isEnriching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Extracting AI Meta...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Enrich & Clip URL
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick Snippet clip */}
          <div className={`p-6 rounded-2xl border ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-pink-500" />
              Clip Snippet Code
            </h3>
            <p className={`text-xs mt-1 mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Instantly catalogue a snippet with language settings.
            </p>

            <form onSubmit={handleQuickSnippet} className="space-y-3">
              <input
                type="text"
                value={quickSnippetTitle}
                onChange={(e) => setQuickSnippetTitle(e.target.value)}
                placeholder="Title e.g. Flex Grid"
                className={`w-full p-2.5 rounded-xl text-xs font-sans border focus:outline-none focus:ring-1 focus:ring-pink-500 ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
              
              <textarea
                value={quickSnippetCode}
                onChange={(e) => setQuickSnippetCode(e.target.value)}
                placeholder="Source code snippet..."
                rows={3}
                className={`w-full p-2.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-pink-500 ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />

              <div className="flex gap-2">
                <select
                  value={quickSnippetLang}
                  onChange={(e) => setQuickSnippetLang(e.target.value)}
                  className={`flex-1 p-2 rounded-xl text-xs font-mono border focus:outline-none ${
                    darkMode ? 'bg-slate-950 border-slate-850 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="typescript">TypeScript</option>
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="html">HTML</option>
                  <option value="css">CSS</option>
                  <option value="bash">Bash/Shell</option>
                  <option value="sql">SQL</option>
                </select>

                <button 
                  type="submit"
                  disabled={!quickSnippetTitle.trim() || !quickSnippetCode.trim()}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Catalog
                </button>
              </div>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
