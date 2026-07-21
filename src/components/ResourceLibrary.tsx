import React, { useState, useEffect } from 'react';
import { 
  Link2, 
  Code, 
  Plus, 
  Trash2, 
  Search, 
  Paperclip, 
  ExternalLink, 
  Copy, 
  Check, 
  Loader2,
  FileCode,
  Github,
  Youtube,
  FileText,
  Globe,
  Tag,
  BookOpen,
  Info
} from 'lucide-react';
import { Resource, CodeSnippet } from '../types';
import { db } from '../db';

interface ResourceLibraryProps {
  darkMode: boolean;
  triggerRefresh: () => void;
}

export default function ResourceLibrary({ darkMode, triggerRefresh }: ResourceLibraryProps) {
  const [activeTab, setActiveTab] = useState<'links' | 'code'>('links');
  const [resources, setResources] = useState<Resource[]>([]);
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Link Resource State
  const [urlInput, setUrlInput] = useState('');
  const [urlNotes, setUrlNotes] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);
  
  // Create Code Snippet State
  const [snipTitle, setSnipTitle] = useState('');
  const [snipCode, setSnipCode] = useState('');
  const [snipNotes, setSnipNotes] = useState('');
  const [snipLang, setSnipLang] = useState('typescript');

  // Copy State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const resList = await db.getResources();
      const snipList = await db.getCodeSnippets();
      setResources(resList);
      setSnippets(snipList);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Enrich & Add Resource link
  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsEnriching(true);
    try {
      let finalUrl = urlInput.trim();
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }

      // Call our secure backend API
      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl })
      });

      const data = await response.json();
      const meta = data.metadata || {
        title: finalUrl,
        category: 'url',
        description: 'Added link resource.'
      };

      const newResource: Resource = {
        id: crypto.randomUUID(),
        title: meta.title || finalUrl,
        url: finalUrl,
        category: meta.category || 'url',
        notes: urlNotes.trim() || 'No personal notes provided.',
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
      setUrlInput('');
      setUrlNotes('');
      loadData();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleDeleteResource = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete bookmark resource "${title}"?`)) return;
    try {
      await db.deleteResource(id, title);
      loadData();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Language Detection heuristic
  const detectLanguage = (code: string): string => {
    const codeTrim = code.trim();
    if (codeTrim.startsWith('import ') || codeTrim.startsWith('export ') || codeTrim.includes('const ') || codeTrim.includes('interface ')) {
      return 'typescript';
    }
    if (codeTrim.startsWith('def ') || codeTrim.startsWith('import python') || codeTrim.includes('print(')) {
      return 'python';
    }
    if (codeTrim.startsWith('<!DOCTYPE html>') || codeTrim.includes('</div>') || codeTrim.includes('</html>')) {
      return 'html';
    }
    if (codeTrim.includes('SELECT ') || codeTrim.includes('INSERT INTO') || codeTrim.includes('CREATE TABLE')) {
      return 'sql';
    }
    if (codeTrim.includes('{') && (codeTrim.includes('margin:') || codeTrim.includes('color:') || codeTrim.includes('padding:'))) {
      return 'css';
    }
    return 'javascript';
  };

  // Add Code Snippet
  const handleAddSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snipTitle.trim() || !snipCode.trim()) return;

    // Auto-detect language if same as default
    const detected = detectLanguage(snipCode);

    try {
      const newSnippet: CodeSnippet = {
        id: crypto.randomUUID(),
        title: snipTitle.trim(),
        code: snipCode,
        language: snipLang === 'auto' ? detected : snipLang,
        notes: snipNotes.trim() || 'No secondary catalog notes.',
        createdAt: new Date().toISOString()
      };

      await db.saveCodeSnippet(newSnippet, 'create');
      setSnipTitle('');
      setSnipCode('');
      setSnipNotes('');
      setSnipLang('typescript');
      loadData();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSnippet = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete code snippet "${title}"?`)) return;
    try {
      await db.deleteCodeSnippet(id, title);
      loadData();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Simple and highly effective custom syntax highlighting regex parser
  const renderHighlightedCode = (code: string, language: string) => {
    if (!code) return '';

    // Safe escaping of HTML
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    const escaped = escapeHtml(code);

    // Basic regex highlights for standard code tokens
    if (['typescript', 'javascript', 'json'].includes(language)) {
      return escaped
        .replace(/\b(const|let|var|function|return|export|import|from|class|extends|interface|type|default|async|await|false|true|null|undefined)\b/g, '<span class="text-pink-500 font-bold">$1</span>')
        .replace(/(\/\/.*)/g, '<span class="text-slate-500 italic">$1</span>')
        .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="text-emerald-400">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="text-amber-400">$1</span>');
    }

    if (language === 'python') {
      return escaped
        .replace(/\b(def|class|return|import|from|print|if|else|elif|for|while|in|and|or|not|as|with|try|except|None|True|False)\b/g, '<span class="text-pink-500 font-bold">$1</span>')
        .replace(/(#.*)/g, '<span class="text-slate-500 italic">$1</span>')
        .replace(/(".*?"|'.*?')/g, '<span class="text-emerald-400">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="text-amber-400">$1</span>');
    }

    if (language === 'sql') {
      return escaped
        .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT|RIGHT|ON|CREATE|TABLE|DATABASE|INDEX|PRIMARY|KEY|VALUES|AND|OR|IN|NULL)\b/gi, '<span class="text-pink-500 font-bold uppercase">$1</span>')
        .replace(/(--.*)/g, '<span class="text-slate-500 italic">$1</span>')
        .replace(/('.*?')/g, '<span class="text-emerald-400">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="text-amber-400">$1</span>');
    }

    return escaped;
  };

  // Filters
  const filteredResources = resources.filter(res => {
    const q = searchQuery.toLowerCase();
    return (
      res.title.toLowerCase().includes(q) ||
      res.url.toLowerCase().includes(q) ||
      res.notes.toLowerCase().includes(q) ||
      res.category.toLowerCase().includes(q) ||
      res.metadata?.description?.toLowerCase().includes(q)
    );
  });

  const filteredSnippets = snippets.filter(snip => {
    const q = searchQuery.toLowerCase();
    return (
      snip.title.toLowerCase().includes(q) ||
      snip.code.toLowerCase().includes(q) ||
      snip.notes.toLowerCase().includes(q) ||
      snip.language.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1">
      
      {/* Tab select & Header panel */}
      <div className={`p-6 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Resource Catalog</h1>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Store enriched hypermedia bookmarks and high-utility syntax code blocks locally.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex border border-slate-800 rounded-xl overflow-hidden bg-slate-950 p-0.5 font-mono text-xs shrink-0 self-stretch sm:self-auto">
          <button
            onClick={() => { setActiveTab('links'); setSearchQuery(''); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg cursor-pointer transition flex items-center justify-center gap-1.5 ${
              activeTab === 'links' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4" />
            Enriched Bookmarks ({resources.length})
          </button>
          <button
            onClick={() => { setActiveTab('code'); setSearchQuery(''); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg cursor-pointer transition flex items-center justify-center gap-1.5 ${
              activeTab === 'code' ? 'bg-pink-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code className="w-4 h-4" />
            Code Snippets ({snippets.length})
          </button>
        </div>
      </div>

      {/* Grid: Forms Pane on Left / Output List on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creation forms */}
        <div className="space-y-6">
          {activeTab === 'links' ? (
            // Add Link Bookmark Card
            <div className={`p-5 rounded-2xl border ${
              darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
                <Link2 className="w-4 h-4 text-blue-500" />
                Bookmark & Scan URL
              </h3>
              <p className={`text-[11px] mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Let Gemini scrapers extract high-fidelity titles, catalogs, descriptions, and authors server-side!
              </p>

              <form onSubmit={handleAddResource} className="space-y-3 text-xs font-sans">
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Resource Web Link</label>
                  <input
                    type="text"
                    required
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="e.g. github.com/shaikh-jnas"
                    className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Personal Annotations</label>
                  <textarea
                    value={urlNotes}
                    onChange={(e) => setUrlNotes(e.target.value)}
                    placeholder="Why are you keeping this resource?..."
                    rows={4}
                    className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!urlInput.trim() || isEnriching}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-medium transition cursor-pointer flex justify-center items-center gap-2"
                >
                  {isEnriching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gemini Scanning Web Link...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Enrich & Save Bookmark
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            // Add Code Snippet Card
            <div className={`p-5 rounded-2xl border ${
              darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
                <Code className="w-4 h-4 text-pink-500" />
                Catalogue Code Block
              </h3>
              <p className={`text-[11px] mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Save developer utility functions with local-first syntax highlights.
              </p>

              <form onSubmit={handleAddSnippet} className="space-y-3 text-xs font-sans">
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Snippet Reference Title</label>
                  <input
                    type="text"
                    required
                    value={snipTitle}
                    onChange={(e) => setSnipTitle(e.target.value)}
                    placeholder="e.g. Promisified IndexedDB"
                    className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-pink-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Code Block Source</label>
                  <textarea
                    required
                    value={snipCode}
                    onChange={(e) => setSnipCode(e.target.value)}
                    placeholder="Paste source code snippet here..."
                    rows={8}
                    className="w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-pink-500 bg-slate-950 border-slate-850 text-white placeholder-slate-600 font-mono text-[11px] leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Language Setting</label>
                  <select
                    value={snipLang}
                    onChange={(e) => setSnipLang(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border focus:outline-none ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="auto">Auto-detect Syntax</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="sql">SQL</option>
                    <option value="html">HTML</option>
                    <option value="css">CSS</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Internal Documentation / Notes</label>
                  <input
                    type="text"
                    value={snipNotes}
                    onChange={(e) => setSnipNotes(e.target.value)}
                    placeholder="e.g. Connection leak mitigation helper."
                    className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-pink-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!snipTitle.trim() || !snipCode.trim()}
                  className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-xl font-medium transition cursor-pointer flex justify-center items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Catalog Code Snippet
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Output list on Right (2 Columns span) */}
        <div className="lg:col-span-2 space-y-4 flex flex-col h-[750px]">
          
          {/* Search bar */}
          <div className={`p-4 rounded-xl border flex items-center shrink-0 ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-450" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'links' ? "Filter enriched links..." : "Search local snippets catalog..."}
                className={`w-full pl-10 pr-4 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
                  activeTab === 'links' ? 'focus:ring-blue-500' : 'focus:ring-pink-500'
                } ${
                  darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              />
            </div>
          </div>

          {/* Scrolling output body */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar">
            {activeTab === 'links' ? (
              /* Enriched Links bookmarks */
              filteredResources.length === 0 ? (
                <div className="p-12 text-center text-xs opacity-50 font-mono">No bookmarked links match your filter.</div>
              ) : (
                filteredResources.map((res) => (
                  <div 
                    key={res.id} 
                    className={`p-4 rounded-xl border transition flex flex-col sm:flex-row justify-between gap-4 items-start ${
                      darkMode ? 'bg-slate-900/40 border-slate-850 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2 flex-1 min-w-0 text-left">
                      {/* Title & Category tag */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Category specific Icon */}
                        <div className={`p-1.5 rounded-lg shrink-0 ${
                          res.category === 'youtube' ? 'bg-rose-500/10 text-rose-400' :
                          res.category === 'github' ? 'bg-slate-500/10 text-white' :
                          res.category === 'pdf' ? 'bg-orange-500/10 text-orange-400' :
                          'bg-blue-500/10 text-blue-400'
                        }`}>
                          {res.category === 'youtube' && <Youtube className="w-3.5 h-3.5" />}
                          {res.category === 'github' && <Github className="w-3.5 h-3.5" />}
                          {res.category === 'pdf' && <FileText className="w-3.5 h-3.5" />}
                          {res.category !== 'youtube' && res.category !== 'github' && res.category !== 'pdf' && <Globe className="w-3.5 h-3.5" />}
                        </div>

                        <span className="text-[10px] uppercase font-mono font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-850 text-slate-400">
                          {res.category}
                        </span>

                        <h4 className={`text-xs font-bold leading-tight truncate max-w-[320px] ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          {res.title}
                        </h4>
                      </div>

                      {/* Decoded URL */}
                      <a 
                        href={res.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[11px] font-mono text-blue-400 hover:underline flex items-center gap-1 leading-none"
                      >
                        {res.url}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>

                      {/* Enriched Details Description block */}
                      {res.metadata?.description && (
                        <div className={`p-3 rounded-xl border text-[11px] leading-relaxed relative ${
                          darkMode ? 'bg-slate-950/60 border-slate-850 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'
                        }`}>
                          <p>{res.metadata.description}</p>
                          
                          {/* Extra metadata chips */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-850 border-dashed text-[10px] font-mono opacity-60">
                            {res.metadata.author && <span>Author: {res.metadata.author}</span>}
                            {res.metadata.language && <span>Lang: {res.metadata.language}</span>}
                            {res.metadata.stars && <span>GitHub Stars: ★{res.metadata.stars}</span>}
                            {res.metadata.videoDuration && <span>Length: {res.metadata.videoDuration}</span>}
                          </div>
                        </div>
                      )}

                      {/* Personal notes */}
                      <p className={`text-[11px] italic pl-2 border-l-2 border-blue-500/40 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className="font-sans font-bold not-italic text-[10px] text-slate-500 block">Personal Note:</span>
                        "{res.notes}"
                      </p>
                    </div>

                    <button 
                      onClick={() => handleDeleteResource(res.id, res.title)}
                      className="p-2 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-xl transition shrink-0 cursor-pointer text-xs"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )
            ) : (
              /* Code Snippets */
              filteredSnippets.length === 0 ? (
                <div className="p-12 text-center text-xs opacity-50 font-mono">No code snippets match your filter.</div>
              ) : (
                filteredSnippets.map((snip) => (
                  <div 
                    key={snip.id} 
                    className={`p-4 rounded-xl border text-left space-y-3 transition relative group ${
                      darkMode ? 'bg-slate-900/40 border-slate-850 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        {/* Title & tags */}
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-pink-400 shrink-0" />
                          <h4 className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{snip.title}</h4>
                          <span className="text-[10px] font-mono uppercase bg-pink-500/10 text-pink-400 border border-pink-500/15 px-1.5 py-0.2 rounded">
                            {snip.language}
                          </span>
                        </div>
                        {snip.notes && (
                          <p className={`text-[10px] mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{snip.notes}</p>
                        )}
                      </div>

                      {/* Copy & Delete */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyCode(snip.id, snip.code)}
                          className="p-1.5 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg transition cursor-pointer relative"
                          title="Copy Code"
                        >
                          {copiedId === snip.id ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteSnippet(snip.id, snip.title)}
                          className="p-1.5 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Highlighted Code Area */}
                    <div className="relative">
                      <pre className="p-4 rounded-xl bg-slate-950 border border-slate-850 font-mono text-[11px] leading-relaxed overflow-x-auto text-slate-300 select-all scrollbar">
                        <code dangerouslySetInnerHTML={{ __html: renderHighlightedCode(snip.code, snip.language) }} />
                      </pre>
                    </div>
                  </div>
                ))
              )
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
