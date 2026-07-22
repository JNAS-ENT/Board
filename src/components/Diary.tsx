import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  CheckCircle, 
  Calendar, 
  Clock, 
  Search,
  FileText,
  Save,
  ChevronRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DiaryEntry } from '../types';
import { db } from '../db';

interface DiaryProps {
  darkMode: boolean;
  triggerRefresh: () => void;
}

export default function Diary({ darkMode, triggerRefresh }: DiaryProps) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  
  // Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [isSaving, setIsSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadEntries();

    const handleDbUpdated = () => {
      loadEntries(false);
    };
    window.addEventListener('jnas_db_updated', handleDbUpdated);
    return () => {
      window.removeEventListener('jnas_db_updated', handleDbUpdated);
    };
  }, []);

  const loadEntries = async (selectFirst = true) => {
    try {
      const all = await db.getDiaryEntries();
      setEntries(all);
      if (selectFirst && all.length > 0) {
        handleSelectEntry(all[0]);
      } else if (all.length === 0) {
        setSelectedEntry(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectEntry = (entry: DiaryEntry) => {
    setSelectedEntry(entry);
    setEditorTitle(entry.title);
    setEditorContent(entry.content);
    
    // Auto-focus the editor textarea immediately with a single click
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const length = entry.content.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }, 50);
  };

  // Autosave setup (Debounced 200ms saving)
  useEffect(() => {
    if (!selectedEntry) return;

    // Check if anything actually changed to prevent redundant saving
    if (editorTitle === selectedEntry.title && editorContent === selectedEntry.content) {
      return;
    }

    setIsSaving(true);
    const saveTimer = setTimeout(async () => {
      try {
        const updatedEntry = {
          ...selectedEntry,
          title: editorTitle.trim() || 'Untitled Stream',
          content: editorContent,
          updatedAt: new Date().toISOString()
        };

        await db.saveDiaryEntry(updatedEntry);
        
        // Update local item in list without resetting selection position
        setEntries(prev => prev.map(e => e.id === selectedEntry.id ? updatedEntry : e));
        setSelectedEntry(updatedEntry);
        triggerRefresh();
      } catch (err) {
        console.error("Autosave failed:", err);
      } finally {
        setIsSaving(false);
      }
    }, 400); // 400ms debounce ensures rapid typing fluidly buffers

    return () => clearTimeout(saveTimer);
  }, [editorTitle, editorContent]);

  // Create new entry
  const handleCreateEntry = async () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const newEntry: DiaryEntry = {
      id: crypto.randomUUID(),
      title: `Journal - ${formattedDate}`,
      content: `# Journal Log — ${formattedDate}\n\n${formattedDate} • ${formattedTime}\nInitialized work stream.\n`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    try {
      await db.saveDiaryEntry(newEntry);
      await loadEntries(false);
      handleSelectEntry(newEntry);
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Delete entry
  const handleDeleteEntry = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete diary journal "${title}"?`)) return;

    try {
      await db.deleteDiaryEntry(id, title);
      const remaining = entries.filter(e => e.id !== id);
      setEntries(remaining);
      if (remaining.length > 0) {
        handleSelectEntry(remaining[0]);
      } else {
        setSelectedEntry(null);
        setEditorTitle('');
        setEditorContent('');
      }
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // AUTOMATIC TIMESTAMP INSERTER ON ENTER KEY
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Intercept Enter

      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPosition = textarea.selectionStart;
      const content = textarea.value;

      // Format Current Timestamp
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      const stamp = `\n\n${formattedDate} • ${formattedTime}\n`;

      // Split content and insert timestamp
      const beforeCursor = content.substring(0, cursorPosition);
      const afterCursor = content.substring(cursorPosition);
      const newContent = beforeCursor + stamp + afterCursor;

      setEditorContent(newContent);

      // Restore Cursor position right after the newly inserted timestamp
      const newCursorPos = cursorPosition + stamp.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  // Filtering
  const filteredEntries = entries.filter(entry => {
    const q = searchQuery.toLowerCase();
    return (
      entry.title.toLowerCase().includes(q) ||
      entry.content.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-1 h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6">
      
      {/* Left Sidebar Panel: Entries list */}
      <div className={`w-full md:w-80 flex flex-col shrink-0 border rounded-2xl overflow-hidden ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        
        {/* Search & Actions Header */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold flex items-center gap-1.5 text-slate-300">
              <BookOpen className="w-4 h-4 text-blue-500" />
              Journal Stream
            </h2>
            <button 
              onClick={handleCreateEntry}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition text-xs flex items-center gap-1 cursor-pointer font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              New Log
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stream records..."
              className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            />
          </div>
        </div>

        {/* Entries scroll list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800 divide-dashed scrollbar p-2 space-y-1">
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-xs opacity-40 font-mono">
              No journal logs found.
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              
              return (
                <div 
                  key={entry.id}
                  onClick={() => handleSelectEntry(entry)}
                  className={`p-3 rounded-xl cursor-pointer text-left transition ${
                    isSelected 
                      ? 'bg-blue-500/10 border border-blue-500/20' 
                      : 'hover:bg-slate-850/50 border border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <h4 className={`text-xs font-semibold truncate ${
                      isSelected ? 'text-blue-400' : darkMode ? 'text-slate-200' : 'text-slate-800'
                    }`}>
                      {entry.title || 'Untitled Stream'}
                    </h4>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEntry(entry.id, entry.title);
                      }}
                      className="opacity-0 hover:opacity-100 group-hover:opacity-100 p-0.5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded transition shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  
                  {/* Snip of contents */}
                  <p className="text-[10px] text-slate-500 truncate mt-1">
                    {entry.content.replace(/[#*`_-]/g, '').slice(0, 80)}
                  </p>

                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: Markdown Workspace */}
      {selectedEntry ? (
        <div className={`flex-1 flex flex-col border rounded-2xl overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          
          {/* Editor Header controls */}
          <div className="px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-950/20">
            {/* Title field */}
            <input
              type="text"
              value={editorTitle}
              onChange={(e) => setEditorTitle(e.target.value)}
              placeholder="Stream Title..."
              className="text-sm font-bold bg-transparent border-b border-transparent hover:border-slate-800 focus:border-blue-500 focus:outline-none transition py-0.5 max-w-sm"
            />

            {/* View selectors */}
            <div className="flex items-center gap-4 text-xs">
              
              {/* Saving status */}
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                    <span>Autosaving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span>Synced Local</span>
                  </>
                )}
              </div>

              <div className="flex items-center border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-0.5 font-mono">
                <button 
                  onClick={() => setViewMode('edit')}
                  className={`px-2.5 py-1 text-[10px] rounded cursor-pointer transition ${
                    viewMode === 'edit' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Editor
                </button>
                <button 
                  onClick={() => setViewMode('split')}
                  className={`hidden md:block px-2.5 py-1 text-[10px] rounded cursor-pointer transition ${
                    viewMode === 'split' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Split View
                </button>
                <button 
                  onClick={() => setViewMode('preview')}
                  className={`px-2.5 py-1 text-[10px] rounded cursor-pointer transition ${
                    viewMode === 'preview' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
          </div>

          {/* Core Body Editor Layout */}
          <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-slate-800 divide-dashed">
            
            {/* Split Editor Pane */}
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div className="flex-1 flex flex-col h-full relative p-2">
                <div className="absolute right-4 bottom-4 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-blue-400 z-10 flex items-center gap-1 pointer-events-none opacity-50 shadow-md">
                  <Sparkles className="w-3 h-3" />
                  <span>Enter auto-timestamps</span>
                </div>

                <textarea
                  ref={textareaRef}
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Write Markdown here... Hit Enter to automatically add timestamps.`}
                  className="w-full h-full p-4 resize-none bg-transparent focus:outline-none text-xs font-mono leading-relaxed overflow-y-auto"
                />
              </div>
            )}

            {/* Split Preview Pane */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div className={`flex-1 p-6 overflow-y-auto prose prose-invert prose-xs text-xs font-sans leading-relaxed h-full ${
                darkMode ? 'bg-slate-900' : 'bg-slate-50'
              }`}>
                {editorContent.trim() === '' ? (
                  <div className="py-20 text-center opacity-40 font-mono text-[11px]">Empty markdown block.</div>
                ) : (
                  <div className="markdown-body space-y-3">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editorContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>
      ) : (
        <div className={`flex-1 flex flex-col justify-center items-center p-12 border border-dashed rounded-2xl ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-400'
        }`}>
          <FileText className="w-12 h-12 text-slate-600 mb-4 animate-bounce" />
          <h3 className="font-semibold text-sm mb-1 text-slate-300">Workspace Stream Empty</h3>
          <p className="text-xs mb-4 text-center max-w-sm">Create a new diary log to begin cataloging structured daily journals with automatic timeline audits.</p>
          <button 
            onClick={handleCreateEntry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Initialize Record stream
          </button>
        </div>
      )}

    </div>
  );
}
