import React, { useState, useEffect, useRef } from 'react';
import { 
  Palette, 
  Plus, 
  MousePointer, 
  Hand, 
  Link2, 
  Trash2, 
  Info,
  Link2Off,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { WhiteboardElement } from '../types';
import { db } from '../db';

interface WhiteboardProps {
  darkMode: boolean;
  triggerRefresh: () => void;
  activeItemId?: string | null;
}

export default function Whiteboard({ darkMode, triggerRefresh, activeItemId }: WhiteboardProps) {
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  
  // Viewport scale and coordinates offset
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  
  // Modes: 'select' (Default drag nodes), 'pan' (Move canvas), 'connect' (Join nodes)
  const [tool, setTool] = useState<'select' | 'pan' | 'connect'>('select');
  
  // Interaction states
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Link Source node
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  
  // Text double-click editor
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  const loadElements = async () => {
    try {
      const all = await db.getWhiteboardElements();
      setElements(all);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadElements();
  }, []);

  // Handle Search direct navigation trigger
  useEffect(() => {
    if (activeItemId && elements.length > 0) {
      const item = elements.find(el => el.id === activeItemId);
      if (item) {
        if (containerRef.current) {
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          setPanX(w / 2 - item.x * zoom);
          setPanY(h / 2 - item.y * zoom);
        }
        setEditingElementId(item.id);
        setEditingText(item.text);
      }
    }
  }, [activeItemId, elements]);

  // Create sticky notes or mindmap nodes
  const handleAddElement = async (type: 'sticky' | 'mindmap_node') => {
    let x = 120;
    let y = 120;

    if (containerRef.current) {
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      x = Math.round((w / 2 - panX) / zoom);
      y = Math.round((h / 2 - panY) / zoom);
    }

    const colors = type === 'sticky' 
      ? ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff'] 
      : ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

    const color = colors[Math.floor(Math.random() * colors.length)];

    const newElement: WhiteboardElement = {
      id: crypto.randomUUID(),
      type: type,
      x: x - 60,
      y: y - 50,
      width: type === 'sticky' ? 140 : 120,
      height: type === 'sticky' ? 120 : 60,
      text: type === 'sticky' ? 'Double-click to write.' : 'New Node',
      color: color,
      shape: type === 'sticky' ? 'rectangle' : 'circle'
    };

    try {
      await db.saveWhiteboardElement(newElement);
      loadElements();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // Node Drag Trigger
  const handleNodeMouseDown = (e: React.MouseEvent, elem: WhiteboardElement) => {
    if (tool === 'connect') {
      e.stopPropagation();
      if (!connectionSourceId) {
        setConnectionSourceId(elem.id);
      } else if (connectionSourceId !== elem.id) {
        handleCreateLink(connectionSourceId, elem.id);
      }
      return;
    }

    if (tool !== 'select') return;
    e.stopPropagation();
    
    setDraggingElementId(elem.id);
    setDragOffset({
      x: e.clientX / zoom - elem.x,
      y: e.clientY / zoom - elem.y
    });
  };

  const handleCreateLink = async (sourceId: string, destId: string) => {
    try {
      // Create connection element
      const newConnection: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: 'connection',
        x: 0,
        y: 0,
        text: 'link',
        fromId: sourceId,
        toId: destId
      };

      await db.saveWhiteboardElement(newConnection);
      showConnectionAlert('Connected nodes successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setConnectionSourceId(null);
      setTool('select');
      loadElements();
    }
  };

  const [connAlert, setConnAlert] = useState('');
  const showConnectionAlert = (msg: string) => {
    setConnAlert(msg);
    setTimeout(() => setConnAlert(''), 3000);
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pan' || e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({
        x: e.clientX - panX,
        y: e.clientY - panY
      });
    } else {
      setEditingElementId(null);
      setConnectionSourceId(null);
    }
  };

  const handleMouseMove = async (e: React.MouseEvent) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
      return;
    }

    if (draggingElementId && tool === 'select') {
      const nextX = Math.round(e.clientX / zoom - dragOffset.x);
      const nextY = Math.round(e.clientY / zoom - dragOffset.y);
      
      setElements(prev => prev.map(item => 
        item.id === draggingElementId ? { ...item, x: nextX, y: nextY } : item
      ));
    }
  };

  const handleMouseUp = async () => {
    setIsPanning(false);

    if (draggingElementId) {
      const el = elements.find(item => item.id === draggingElementId);
      if (el) {
        try {
          await db.saveWhiteboardElement(el);
          triggerRefresh();
        } catch (err) {
          console.error(err);
        }
      }
      setDraggingElementId(null);
    }
  };

  const handleNodeTextSave = async (id: string) => {
    try {
      const el = elements.find(item => item.id === id);
      if (el) {
        const updated = {
          ...el,
          text: editingText.trim() || 'Content text'
        };
        await db.saveWhiteboardElement(updated);
        setEditingElementId(null);
        loadElements();
        triggerRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangeColor = async (elem: WhiteboardElement, color: string) => {
    try {
      const updated = { ...elem, color };
      await db.saveWhiteboardElement(updated);
      loadElements();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteElement = async (id: string) => {
    try {
      await db.deleteWhiteboardElement(id);
      
      // Also delete any connection elements linked to this deleted element
      const connectionsToDelete = elements.filter(
        el => el.type === 'connection' && (el.fromId === id || el.toId === id)
      );

      for (const conn of connectionsToDelete) {
        await db.deleteWhiteboardElement(conn.id);
      }

      loadElements();
      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlinkNode = async (id: string) => {
    try {
      const connectionsToClear = elements.filter(
        el => el.type === 'connection' && (el.fromId === id || el.toId === id)
      );

      for (const conn of connectionsToClear) {
        await db.deleteWhiteboardElement(conn.id);
      }

      loadElements();
      triggerRefresh();
      showConnectionAlert('Unlinked connections.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleZoomIn = () => setZoom(z => Math.min(2.5, z + 0.15));
  const handleZoomOut = () => setZoom(z => Math.max(0.4, z - 0.15));
  const handleZoomReset = () => { setZoom(1); setPanX(0); setPanY(0); };

  const drawLinkBezier = (source: WhiteboardElement, dest: WhiteboardElement) => {
    const sWidth = source.width || 120;
    const sHeight = source.height || 60;
    const dWidth = dest.width || 120;
    const dHeight = dest.height || 60;

    const sx = source.x + sWidth / 2;
    const sy = source.y + sHeight / 2;
    const dx = dest.x + dWidth / 2;
    const dy = dest.y + dHeight / 2;

    const controlX1 = sx + (dx - sx) / 2;
    const controlY1 = sy;
    const controlX2 = sx + (dx - sx) / 2;
    const controlY2 = dy;

    return `M ${sx} ${sy} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${dx} ${dy}`;
  };

  const nodeElements = elements.filter(el => el.type === 'sticky' || el.type === 'mindmap_node');
  const connectionElements = elements.filter(el => el.type === 'connection');

  return (
    <div className="max-w-7xl mx-auto px-1 h-[calc(100vh-140px)] flex flex-col gap-4 relative">
      
      {/* Floating Toolbar Controls */}
      <div className={`p-4 rounded-xl border flex flex-wrap justify-between items-center gap-4 z-10 shrink-0 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleAddElement('sticky')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Sticky
          </button>
          
          <button
            onClick={() => handleAddElement('mindmap_node')}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium cursor-pointer transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Mindmap Node
          </button>
        </div>

        {connAlert && (
          <div className="text-xs font-semibold font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 animate-fade-in">
            {connAlert}
          </div>
        )}

        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono opacity-50">Scale: {Math.round(zoom * 100)}%</span>

          <div className="flex border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-0.5 font-mono text-xs">
            <button
              onClick={() => { setTool('select'); setConnectionSourceId(null); }}
              title="Select / Move node elements"
              className={`p-1.5 rounded cursor-pointer transition ${
                tool === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MousePointer className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setTool('pan'); setConnectionSourceId(null); }}
              title="Pan World viewport space"
              className={`p-1.5 rounded cursor-pointer transition ${
                tool === 'pan' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Hand className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('connect')}
              title="Draw links between nodes"
              className={`p-1.5 rounded cursor-pointer transition ${
                tool === 'connect' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-0.5">
            <button onClick={handleZoomIn} className="p-1 hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer rounded"><ZoomIn className="w-4 h-4" /></button>
            <button onClick={handleZoomOut} className="p-1 hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer rounded"><ZoomOut className="w-4 h-4" /></button>
            <button onClick={handleZoomReset} className="p-1 text-[10px] font-mono hover:bg-slate-900 text-slate-400 hover:text-white cursor-pointer rounded font-bold px-1.5">1:1</button>
          </div>
        </div>
      </div>

      {/* Grid Canvas stage */}
      <div 
        ref={containerRef}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`flex-1 rounded-2xl border overflow-hidden relative cursor-grab select-none ${
          isPanning ? 'cursor-grabbing' : ''
        } ${
          darkMode ? 'bg-slate-950 border-slate-900 grid-bg-dark' : 'bg-slate-50 border-slate-200 grid-bg-light'
        }`}
        style={{
          backgroundPosition: `${panX}px ${panY}px`
        }}
      >
        
        {/* Transformable Canvas coordinates space */}
        <div 
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`
          }}
        >
          
          {/* connection line SVGs */}
          <svg className="absolute overflow-visible w-full h-full inset-0 pointer-events-none">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#0284c7" />
              </marker>
            </defs>

            {connectionElements.map((conn) => {
              const source = nodeElements.find(el => el.id === conn.fromId);
              const dest = nodeElements.find(el => el.id === conn.toId);
              if (!source || !dest) return null;

              return (
                <path 
                  key={conn.id}
                  d={drawLinkBezier(source, dest)}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  markerEnd="url(#arrow)"
                  className="opacity-70"
                />
              );
            })}
          </svg>

          {/* Node objects (Sticky notes / Mindmap nodes) */}
          {nodeElements.map((elem) => {
            const isEditing = editingElementId === elem.id;
            const isConnectionSource = connectionSourceId === elem.id;
            const width = elem.width || 120;
            const height = elem.height || 60;

            const elemConnectionsCount = connectionElements.filter(
              c => c.fromId === elem.id || c.toId === elem.id
            ).length;

            return (
              <div
                key={elem.id}
                onMouseDown={(e) => handleNodeMouseDown(e, elem)}
                className={`absolute pointer-events-auto rounded-xl p-4 shadow-md transition duration-200 flex flex-col group ${
                  elem.type === 'sticky' 
                    ? 'border border-amber-400/10 text-slate-900' 
                    : 'border-2'
                } ${
                  isConnectionSource 
                    ? 'ring-4 ring-rose-500 animate-pulse' 
                    : ''
                }`}
                style={{
                  left: elem.x,
                  top: elem.y,
                  width: width,
                  height: height,
                  backgroundColor: elem.type === 'sticky' ? elem.color : darkMode ? '#0f172a' : '#ffffff',
                  borderColor: elem.type === 'sticky' ? 'transparent' : elem.color,
                  color: elem.type === 'sticky' ? '#0f172a' : darkMode ? '#f8fafc' : '#0f172a'
                }}
              >
                
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => handleNodeTextSave(elem.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleNodeTextSave(elem.id);
                      }
                    }}
                    className="w-full h-full bg-transparent resize-none border-none focus:outline-none text-xs font-sans font-medium select-text"
                  />
                ) : (
                  <div 
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingElementId(elem.id);
                      setEditingText(elem.text);
                    }}
                    className={`flex-1 overflow-y-auto text-xs font-medium leading-relaxed break-words scrollbar select-text cursor-text text-left ${
                      elem.type === 'sticky' ? 'text-slate-900' : 'flex items-center justify-center text-center'
                    }`}
                  >
                    {elem.text}
                  </div>
                )}

                {/* Hover control bar */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 rounded-lg p-1 flex items-center gap-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
                  <div className="flex gap-1 pr-1.5 border-r border-slate-800">
                    {elem.type === 'sticky' ? (
                      ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff'].map((col) => (
                        <button
                          key={col}
                          onClick={() => handleChangeColor(elem, col)}
                          className="w-3.5 h-3.5 rounded-full border border-slate-700/20 cursor-pointer"
                          style={{ backgroundColor: col }}
                        />
                      ))
                    ) : (
                      ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'].map((col) => (
                        <button
                          key={col}
                          onClick={() => handleChangeColor(elem, col)}
                          className="w-3.5 h-3.5 rounded-full cursor-pointer"
                          style={{ backgroundColor: col }}
                        />
                      ))
                    )}
                  </div>

                  <button
                    onClick={() => { setTool('connect'); setConnectionSourceId(elem.id); }}
                    className="p-1 hover:bg-slate-900 text-slate-400 hover:text-white rounded transition cursor-pointer"
                    title="Connect to node"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>

                  {elemConnectionsCount > 0 && (
                    <button
                      onClick={() => handleUnlinkNode(elem.id)}
                      className="p-1 hover:bg-slate-900 text-rose-400 hover:text-rose-300 rounded transition cursor-pointer"
                      title="Clear connections"
                    >
                      <Link2Off className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteElement(elem.id)}
                    className="p-1 hover:bg-rose-500/10 text-rose-400 rounded transition cursor-pointer"
                    title="Delete Node"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!isEditing && elemConnectionsCount > 0 && (
                  <div className="absolute right-2 bottom-2 text-[9px] font-mono opacity-40 flex items-center gap-0.5">
                    <Link2 className="w-2.5 h-2.5" />
                    <span>{elemConnectionsCount}</span>
                  </div>
                )}

              </div>
            );
          })}

        </div>

        {/* Info label overlay */}
        <div className="absolute bottom-4 left-4 p-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[10px] font-mono text-slate-400 max-w-sm rounded-xl space-y-1 text-left select-none pointer-events-none shadow-lg">
          <p className="text-blue-400 font-bold">Infinite Canvas Controls:</p>
          <p>• Pan space: Hold Spacebar/Middle-click + Drag background</p>
          <p>• Nodes: Click & Drag. Double-click to write text</p>
          <p>• Links: Hover, click Link Icon, click target node</p>
        </div>

      </div>

    </div>
  );
}
