import React, { useState, useEffect } from 'react';
import { 
  Trello, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  ArrowRight, 
  Calendar, 
  Paperclip, 
  Tag, 
  CheckCircle, 
  Clock, 
  X, 
  Search, 
  Sliders,
  MoreHorizontal
} from 'lucide-react';
import { KanbanColumn, KanbanCard, KanbanAttachment } from '../types';
import { db } from '../db';

interface KanbanProps {
  darkMode: boolean;
  triggerRefresh: () => void;
}

export default function Kanban({ darkMode, triggerRefresh }: KanbanProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals & Forms State
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
  
  // Card Form State
  const [cardTitle, setCardTitle] = useState('');
  const [cardDescription, setCardDescription] = useState('');
  const [cardProgress, setCardProgress] = useState(0);
  const [cardDeadline, setCardDeadline] = useState('');
  const [cardColumnId, setCardColumnId] = useState('');
  const [cardLabels, setCardLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  
  // Attachments in Card Form
  const [attachments, setAttachments] = useState<KanbanAttachment[]>([]);
  const [attachName, setAttachName] = useState('');
  const [attachUrl, setAttachUrl] = useState('');

  const loadBoard = async () => {
    try {
      const cols = await db.getKanbanColumns();
      const allCards = await db.getKanbanCards();
      setColumns(cols);
      setCards(allCards);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadBoard();
  }, []);

  // Save/Update Card
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardTitle.trim()) return;

    try {
      const nowStr = new Date().toISOString();
      const isNew = !editingCard;

      const cardData: KanbanCard = {
        id: editingCard ? editingCard.id : crypto.randomUUID(),
        columnId: cardColumnId || columns[0]?.id || 'todo',
        title: cardTitle.trim(),
        description: cardDescription.trim(),
        progress: Number(cardProgress),
        deadline: cardDeadline || undefined,
        labels: cardLabels,
        attachments: attachments,
        order: editingCard ? editingCard.order : cards.filter(c => c.columnId === cardColumnId).length,
        createdAt: editingCard ? editingCard.createdAt : nowStr
      };

      await db.saveKanbanCard(cardData, isNew ? 'create' : 'update');
      
      setIsCardModalOpen(false);
      setEditingCard(null);
      resetCardForm();
      loadBoard();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const resetCardForm = () => {
    setCardTitle('');
    setCardDescription('');
    setCardProgress(0);
    setCardDeadline('');
    setCardColumnId(columns[0]?.id || 'todo');
    setCardLabels([]);
    setLabelInput('');
    setAttachments([]);
    setAttachName('');
    setAttachUrl('');
  };

  const handleOpenNewCardModal = (colId: string) => {
    resetCardForm();
    setCardColumnId(colId);
    setEditingCard(null);
    setIsCardModalOpen(true);
  };

  const handleOpenEditCardModal = (card: KanbanCard) => {
    setEditingCard(card);
    setCardTitle(card.title);
    setCardDescription(card.description);
    setCardProgress(card.progress);
    setCardDeadline(card.deadline || '');
    setCardColumnId(card.columnId);
    setCardLabels(card.labels);
    setAttachments(card.attachments);
    setAttachName('');
    setAttachUrl('');
    setIsCardModalOpen(true);
  };

  const handleDeleteCard = async (cardId: string, cardTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete task "${cardTitle}"?`)) return;
    try {
      await db.deleteKanbanCard(cardId, cardTitle);
      loadBoard();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Card Move Toggles (Alternative to drag and drop which is highly accessible inside iframes)
  const handleMoveCard = async (card: KanbanCard, direction: 'left' | 'right') => {
    const colIds = columns.map(c => c.id);
    const currentIndex = colIds.indexOf(card.columnId);
    let nextIndex = currentIndex;

    if (direction === 'left' && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    } else if (direction === 'right' && currentIndex < colIds.length - 1) {
      nextIndex = currentIndex + 1;
    }

    if (nextIndex === currentIndex) return;

    try {
      const updatedCard = {
        ...card,
        columnId: colIds[nextIndex],
        progress: colIds[nextIndex] === 'done' ? 100 : card.progress
      };
      await db.saveKanbanCard(updatedCard, 'update');
      loadBoard();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Add Label to active card form
  const handleAddLabel = () => {
    if (!labelInput.trim()) return;
    if (!cardLabels.includes(labelInput.trim())) {
      setCardLabels([...cardLabels, labelInput.trim()]);
    }
    setLabelInput('');
  };

  const handleRemoveLabel = (label: string) => {
    setCardLabels(cardLabels.filter(l => l !== label));
  };

  // Add Attachment to active card form
  const handleAddAttachment = () => {
    if (!attachUrl.trim() || !attachName.trim()) return;
    
    let url = attachUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const newAttachment: KanbanAttachment = {
      name: attachName.trim(),
      url: url,
      type: 'url'
    };

    setAttachments([...attachments, newAttachment]);
    setAttachName('');
    setAttachUrl('');
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  // Filtering
  const filteredCards = cards.filter(card => {
    const query = searchQuery.toLowerCase();
    return (
      card.title.toLowerCase().includes(query) ||
      card.description.toLowerCase().includes(query) ||
      card.labels.some(l => l.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1">
      {/* Kanban Header */}
      <div className={`p-6 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
        darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanban Task Board</h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Track engineering backlogs, sprint pipelines, and milestones offline.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-450" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cards, tags..."
            className={`w-full pl-10 pr-4 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
              darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          />
        </div>
      </div>

      {/* Board Layout (Grid of Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        {columns.map((col) => {
          const colCards = filteredCards.filter(c => c.columnId === col.id);
          
          return (
            <div 
              key={col.id} 
              className={`p-4 rounded-xl border flex flex-col max-h-[750px] ${
                darkMode ? 'bg-slate-900/60 border-slate-850 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              {/* Column Title Header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-dashed border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    col.id === 'todo' ? 'bg-blue-500' :
                    col.id === 'inprogress' ? 'bg-purple-500' :
                    col.id === 'review' ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`} />
                  <h3 className="font-semibold text-sm">{col.title}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                    darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {colCards.length}
                  </span>
                </div>

                <button 
                  onClick={() => handleOpenNewCardModal(col.id)}
                  className="p-1.5 hover:bg-slate-800/20 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Cards Container */}
              <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-[150px] scrollbar">
                {colCards.length === 0 ? (
                  <div className="py-8 text-center text-xs opacity-40 font-sans border border-dashed border-slate-800 rounded-lg">
                    No active tasks.
                  </div>
                ) : (
                  colCards.map((card) => (
                    <div 
                      key={card.id}
                      className={`p-4 rounded-xl border transition shadow-sm relative group flex flex-col ${
                        darkMode ? 'bg-slate-950 border-slate-850 text-white hover:border-slate-700' : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Action Tags */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {card.labels.map((lbl, idx) => (
                          <span 
                            key={idx} 
                            className={`text-[9px] px-1.5 py-0.5 rounded font-medium font-mono ${
                              lbl.toLowerCase().includes('high') || lbl.toLowerCase().includes('critical') 
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' :
                              lbl.toLowerCase().includes('perf') || lbl.toLowerCase().includes('speed')
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' :
                                'bg-slate-500/15 text-slate-400 border border-slate-500/10'
                            }`}
                          >
                            {lbl}
                          </span>
                        ))}
                      </div>

                      {/* Card Title */}
                      <h4 
                        onClick={() => handleOpenEditCardModal(card)}
                        className="font-medium text-xs tracking-tight leading-snug cursor-pointer hover:underline mb-1"
                      >
                        {card.title}
                      </h4>

                      {/* Description */}
                      <p className={`text-[11px] line-clamp-2 leading-relaxed mb-3 ${
                        darkMode ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {card.description}
                      </p>

                      {/* Progress bar */}
                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between items-center text-[9px] font-mono opacity-50">
                          <span>Progress</span>
                          <span>{card.progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              card.progress === 100 ? 'bg-emerald-500' : 'bg-purple-500'
                            }`}
                            style={{ width: `${card.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer Info */}
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-auto pt-2 border-t border-dashed border-slate-850">
                        {/* Deadline */}
                        <div className="flex items-center gap-1">
                          {card.deadline ? (
                            <>
                              <Calendar className="w-3.5 h-3.5 text-rose-500" />
                              <span className="text-rose-400">{card.deadline}</span>
                            </>
                          ) : (
                            <span className="opacity-40">-</span>
                          )}
                        </div>

                        {/* Attachments & Actions */}
                        <div className="flex items-center gap-2">
                          {card.attachments.length > 0 && (
                            <div className="flex items-center gap-0.5 text-blue-400" title="Has Attachments">
                              <Paperclip className="w-3 h-3" />
                              <span>{card.attachments.length}</span>
                            </div>
                          )}

                          {/* Navigation Buttons for Click to move inside iFrames */}
                          <div className="flex items-center border border-slate-800 rounded-md overflow-hidden bg-slate-950">
                            <button 
                              onClick={() => handleMoveCard(card, 'left')}
                              disabled={col.id === 'todo'}
                              className="p-1 hover:bg-slate-800 disabled:opacity-20 text-slate-400 hover:text-white transition cursor-pointer"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => handleMoveCard(card, 'right')}
                              disabled={col.id === 'done'}
                              className="p-1 hover:bg-slate-800 disabled:opacity-20 text-slate-400 hover:text-white transition cursor-pointer"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Quick delete */}
                      <button 
                        onClick={() => handleDeleteCard(card.id, card.title)}
                        className="absolute right-2 top-2 p-1 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition duration-200 cursor-pointer text-[10px]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Card Edit/Create Modal Overlay */}
      {isCardModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl border p-6 overflow-y-auto max-h-[90vh] shadow-2xl relative ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <button 
              onClick={() => setIsCardModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-slate-800/10 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold mb-4 flex items-center gap-2">
              <Trello className="w-4 h-4 text-purple-500" />
              {editingCard ? 'Modify Task Properties' : 'Create Task Card'}
            </h3>

            <form onSubmit={handleSaveCard} className="space-y-4 text-xs font-sans">
              
              {/* Title */}
              <div className="space-y-1">
                <label className="block text-[11px] font-mono text-slate-400 font-bold">Task Title</label>
                <input
                  type="text"
                  required
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  placeholder="Draft system design"
                  className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                    darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-[11px] font-mono text-slate-400 font-bold">Task Details / Specifications</label>
                <textarea
                  value={cardDescription}
                  onChange={(e) => setCardDescription(e.target.value)}
                  placeholder="Provide precise bullet lists..."
                  rows={4}
                  className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                    darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                />
              </div>

              {/* Deadline & Column selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Target Deadline</label>
                  <input
                    type="date"
                    value={cardDeadline}
                    onChange={(e) => setCardDeadline(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-mono text-slate-400 font-bold">Pipeline Step</label>
                  <select
                    value={cardColumnId}
                    onChange={(e) => setCardColumnId(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border focus:outline-none ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    {columns.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress Slider */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-mono text-slate-400 font-bold">Operational Progress</label>
                  <span className="font-mono text-purple-400">{cardProgress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={cardProgress}
                  onChange={(e) => setCardProgress(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              {/* Labels/Tags */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono text-slate-400 font-bold">Labels / Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2 p-2 rounded-xl bg-slate-950/40 border border-slate-850">
                  {cardLabels.length === 0 ? (
                    <span className="text-slate-500 text-[10px]">No labels. Add some below.</span>
                  ) : (
                    cardLabels.map((lbl, idx) => (
                      <span 
                        key={idx} 
                        className="text-[9px] font-mono bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/15 flex items-center gap-1"
                      >
                        {lbl}
                        <button type="button" onClick={() => handleRemoveLabel(lbl)} className="hover:text-rose-500 cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    placeholder="e.g. High Priority"
                    className={`flex-1 p-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddLabel}
                    className="px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Tag
                  </button>
                </div>
              </div>

              {/* Attachments Section */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono text-slate-400 font-bold">Linked URL Attachments</label>
                <div className="flex flex-col gap-1.5 mb-2 p-2 rounded-xl bg-slate-950/40 border border-slate-850">
                  {attachments.length === 0 ? (
                    <span className="text-slate-500 text-[10px]">No attachments cataloged.</span>
                  ) : (
                    attachments.map((att, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] font-mono bg-slate-950/50 p-1.5 rounded border border-slate-850">
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-medium truncate max-w-[280px]">
                          {att.name} ({att.url})
                        </a>
                        <button type="button" onClick={() => handleRemoveAttachment(idx)} className="text-rose-500 hover:text-rose-400 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={attachName}
                    onChange={(e) => setAttachName(e.target.value)}
                    placeholder="Label e.g. Figma Link"
                    className={`p-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                  <input
                    type="text"
                    value={attachUrl}
                    onChange={(e) => setAttachUrl(e.target.value)}
                    placeholder="URL e.g. figma.com/..."
                    className={`p-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                      darkMode ? 'bg-slate-950 border-slate-850 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddAttachment}
                  disabled={!attachName.trim() || !attachUrl.trim()}
                  className="w-full py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white rounded-xl font-medium cursor-pointer flex items-center justify-center gap-1 transition"
                >
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                  Add Link Attachment
                </button>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-850 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCardModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-medium border cursor-pointer ${
                    darkMode ? 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium cursor-pointer transition flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Save Task Details
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
