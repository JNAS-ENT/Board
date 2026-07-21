import React, { useState, useEffect } from 'react';
import { 
  Search as SearchIcon, 
  BookOpen, 
  Trello, 
  Palette, 
  Link2, 
  Code, 
  ChevronRight,
  ArrowRightCircle,
  Hash,
  Database
} from 'lucide-react';
import { DiaryEntry, KanbanCard, WhiteboardElement, Resource, CodeSnippet } from '../types';
import { db } from '../db';

interface SearchProps {
  darkMode: boolean;
  onNavigateToItem: (module: string, itemId: string, extraTab?: string) => void;
}

interface SearchResult {
  id: string;
  module: 'diary' | 'kanban' | 'whiteboard' | 'resource' | 'code';
  title: string;
  snippet: string;
  extraTab?: string; // e.g., 'links' or 'code' for resources
}

export default function Search({ darkMode, onNavigateToItem }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  
  // Entire db states
  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [whiteboard, setWhiteboard] = useState<WhiteboardElement[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);

  const loadAllData = async () => {
    try {
      setDiaries(await db.getDiaryEntries());
      setCards(await db.getKanbanCards());
      setWhiteboard(await db.getWhiteboardElements());
      setResources(await db.getResources());
      setSnippets(await db.getCodeSnippets());
    } catch (err) {
      console.error("Failed to load search index data:", err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    const searchResults: SearchResult[] = [];

    // 1. Search Diary
    diaries.forEach(entry => {
      if (entry.title.toLowerCase().includes(q) || entry.content.toLowerCase().includes(q)) {
        // Find matching line for snippet
        const lines = entry.content.split('\n');
        const matchLine = lines.find(l => l.toLowerCase().includes(q)) || '';
        
        searchResults.push({
          id: entry.id,
          module: 'diary',
          title: entry.title || 'Untitled Diary Log',
          snippet: matchLine.trim() || entry.content.slice(0, 100)
        });
      }
    });

    // 2. Search Kanban
    cards.forEach(card => {
      if (
        card.title.toLowerCase().includes(q) || 
        card.description.toLowerCase().includes(q) || 
        card.labels.some(l => l.toLowerCase().includes(q))
      ) {
        searchResults.push({
          id: card.id,
          module: 'kanban',
          title: `Task: ${card.title}`,
          snippet: card.description.slice(0, 120) + (card.labels.length > 0 ? ` [Labels: ${card.labels.join(', ')}]` : '')
        });
      }
    });

    // 3. Search Whiteboard
    whiteboard.forEach(elem => {
      if (elem.text && elem.text.toLowerCase().includes(q)) {
        searchResults.push({
          id: elem.id,
          module: 'whiteboard',
          title: `Canvas: ${elem.type === 'sticky' ? 'Sticky Note' : 'Mindmap Node'}`,
          snippet: elem.text
        });
      }
    });

    // 4. Search Resources
    resources.forEach(res => {
      if (
        res.title.toLowerCase().includes(q) || 
        res.url.toLowerCase().includes(q) || 
        res.notes.toLowerCase().includes(q) ||
        res.metadata?.description?.toLowerCase().includes(q)
      ) {
        searchResults.push({
          id: res.id,
          module: 'resource',
          title: `Bookmark: ${res.title}`,
          snippet: res.metadata?.description || res.notes || res.url,
          extraTab: 'links'
        });
      }
    });

    // 5. Search Code Snippets
    snippets.forEach(snip => {
      if (
        snip.title.toLowerCase().includes(q) || 
        snip.code.toLowerCase().includes(q) || 
        snip.notes.toLowerCase().includes(q)
      ) {
        searchResults.push({
          id: snip.id,
          module: 'code',
          title: `Snippet: ${snip.title} (${snip.language})`,
          snippet: snip.notes || snip.code.slice(0, 100),
          extraTab: 'code'
        });
      }
    });

    setResults(searchResults);
  }, [query, diaries, cards, whiteboard, resources, snippets]);

  // Helper for bold text match rendering
  const highlightQueryText = (text: string, search: string) => {
    if (!search || !text) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-amber-500/30 text-amber-300 font-bold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-1 animate-fade-in">
      
      {/* Unified Search Header */}
      <div className={`p-6 rounded-2xl border ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <h1 className="text-xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <Database className="w-5 h-5 text-amber-500" />
          Global Search Engine Index
        </h1>
        <p className={`text-xs mt-1 mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Lightning-fast unified keyword index scanner. Instantly trace any logs, whiteboard diagrams, tasks, codebases, or references.
        </p>

        {/* Input bar */}
        <div className="relative">
          <SearchIcon className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type terms to scan workspace..."
            className={`w-full pl-12 pr-4 py-3 text-sm rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono ${
              darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          />
        </div>
      </div>

      {/* Results area */}
      <div className="space-y-3">
        {query.trim() === '' ? (
          <div className={`p-12 border border-dashed rounded-2xl text-center text-xs opacity-50 font-mono ${
            darkMode ? 'bg-slate-900 border-slate-850 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
          }`}>
            Enter keywords above to query the workspace local-first cache database.
          </div>
        ) : results.length === 0 ? (
          <div className="p-12 text-center text-xs opacity-40 font-mono">
            No index hits matching query terms.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[10px] font-mono text-slate-500 px-1">
              Found {results.length} hit{results.length > 1 ? 's' : ''} in the local index
            </div>

            {results.map((res, idx) => (
              <div 
                key={idx}
                onClick={() => onNavigateToItem(res.module === 'code' ? 'resources' : res.module, res.id, res.extraTab)}
                className={`p-4 rounded-xl border transition cursor-pointer flex justify-between items-center gap-6 text-left group ${
                  darkMode ? 'bg-slate-900/40 border-slate-850 hover:border-amber-500/40 hover:bg-slate-900' : 'bg-white border-slate-200 hover:border-amber-500/40'
                }`}
              >
                <div className="flex gap-4 items-start min-w-0">
                  {/* Category icon */}
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    res.module === 'diary' ? 'bg-blue-500/10 text-blue-400' :
                    res.module === 'kanban' ? 'bg-purple-500/10 text-purple-400' :
                    res.module === 'whiteboard' ? 'bg-amber-500/10 text-amber-400' :
                    res.module === 'resource' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-pink-500/10 text-pink-400'
                  }`}>
                    {res.module === 'diary' && <BookOpen className="w-4 h-4" />}
                    {res.module === 'kanban' && <Trello className="w-4 h-4" />}
                    {res.module === 'whiteboard' && <Palette className="w-4 h-4" />}
                    {res.module === 'resource' && <Link2 className="w-4 h-4" />}
                    {res.module === 'code' && <Code className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0 space-y-1">
                    {/* Module category tag and name */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase font-mono font-bold text-slate-500 tracking-wider">
                        {res.module === 'code' ? 'Code Snippet' : res.module}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-600" />
                      <h4 className={`text-xs font-bold truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                        {highlightQueryText(res.title, query)}
                      </h4>
                    </div>

                    {/* Snippet preview */}
                    <p className={`text-[11px] leading-relaxed line-clamp-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {highlightQueryText(res.snippet, query)}
                    </p>
                  </div>
                </div>

                <div className="text-slate-600 group-hover:text-amber-400 transition shrink-0">
                  <ArrowRightCircle className="w-5 h-5" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
