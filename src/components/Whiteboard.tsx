import React, { useState, useEffect, useRef } from 'react';
import { 
  MousePointer, 
  Hand, 
  Link2, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Plus, 
  Copy as CopyIcon, 
  Trash, 
  Lock, 
  Unlock, 
  ChevronUp, 
  ChevronDown,
  ChevronRight,
  Sparkles,
  Type,
  Square,
  Circle as CircleIcon,
  HelpCircle,
  Undo as UndoIcon,
  Redo as RedoIcon,
  ArrowRight,
  Star as StarIcon,
  Image as ImageIcon,
  FolderClosed,
  Smile,
  Layers,
  Database as DatabaseIcon,
  Cloud as CloudIcon,
  FileText
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
  
  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Clipboard
  const [clipboard, setClipboard] = useState<WhiteboardElement[]>([]);

  // Viewport zoom & pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  
  // Tools: 'select', 'pan', 'connect', 'draw_shape'
  const [tool, setTool] = useState<'select' | 'pan' | 'connect' | 'draw_shape'>('select');
  const [activeShapeToDraw, setActiveShapeToDraw] = useState<string>('rectangle');
  
  // Snap to Grid
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Dragging & Interaction
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Resizing States
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null); // 'nw', 'ne', 'se', 'sw'
  const [resizeStartSize, setResizeStartSize] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Spacebar panning helper
  const [spacePressed, setSpacePressed] = useState(false);

  // Connector drawing
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  
  // Single-Click Text Editor
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Load Elements on startup
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

    // Setup global db updated listener (from storage sync triggers)
    const handleDbUpdated = () => {
      loadElements();
    };
    window.addEventListener('jnas_db_updated', handleDbUpdated);
    return () => {
      window.removeEventListener('jnas_db_updated', handleDbUpdated);
    };
  }, []);

  // Save current elements to IndexedDB and backup history
  const saveStateToDB = async (newElements: WhiteboardElement[], updateHistory = true) => {
    try {
      // Clean save to IDB
      await db.saveWhiteboardElements(newElements);
      setElements(newElements);
      triggerRefresh();
      
      if (updateHistory) {
        // Push previous state to undo stack
        const serialized = JSON.stringify(elements);
        setUndoStack(prev => [...prev, serialized]);
        setRedoStack([]); // Clear redo
      }
    } catch (err) {
      console.error('Failed to persist whiteboard changes:', err);
    }
  };

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space bar for dynamic panning
      if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setSpacePressed(true);
      }

      // Short-circuits for typing inside editors
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return;
      }

      // Delete selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }

      // Ctrl shortcuts
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Z (Undo)
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
        // Ctrl+Y (Redo alternate)
        if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
        }
        // Ctrl+D (Duplicate)
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          handleDuplicateSelected();
        }
        // Ctrl+C (Copy)
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          handleCopySelected();
        }
        // Ctrl+V (Paste)
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          handlePaste();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [elements, selectedIds, undoStack, redoStack, clipboard]);

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
        setSelectedIds(new Set([item.id]));
        setEditingElementId(item.id);
        setEditingText(item.text);
      }
    }
  }, [activeItemId, elements]);

  // Undo / Redo Actions
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousStateStr = undoStack[undoStack.length - 1];
    const previousState = JSON.parse(previousStateStr);
    
    // Save current to redo stack
    setRedoStack(prev => [...prev, JSON.stringify(elements)]);
    setUndoStack(prev => prev.slice(0, prev.length - 1));
    
    // Overwrite database
    db.clearWhiteboard().then(() => {
      db.saveWhiteboardElements(previousState).then(() => {
        setElements(previousState);
        triggerRefresh();
      });
    });
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextStateStr = redoStack[redoStack.length - 1];
    const nextState = JSON.parse(nextStateStr);
    
    // Save current to undo stack
    setUndoStack(prev => [...prev, JSON.stringify(elements)]);
    setRedoStack(prev => prev.slice(0, prev.length - 1));
    
    db.clearWhiteboard().then(() => {
      db.saveWhiteboardElements(nextState).then(() => {
        setElements(nextState);
        triggerRefresh();
      });
    });
  };

  // Shape placement
  const handlePlaceShape = async (shapeType: string) => {
    let x = 150;
    let y = 150;

    if (containerRef.current) {
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      x = Math.round((w / 2 - panX) / zoom);
      y = Math.round((h / 2 - panY) / zoom);
    }

    if (snapToGrid) {
      x = Math.round(x / 15) * 15;
      y = Math.round(y / 15) * 15;
    }

    // Default style depending on the shape
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];
    const selectedColor = colors[Math.floor(Math.random() * colors.length)];

    const newElement: WhiteboardElement = {
      id: crypto.randomUUID(),
      type: shapeType === 'sticky' ? 'sticky' : shapeType === 'mindmap' ? 'mindmap_node' : 'shape',
      shape: shapeType,
      x: x - 75,
      y: y - 50,
      width: shapeType === 'sticky' ? 140 : shapeType === 'line' || shapeType === 'arrow' ? 150 : 120,
      height: shapeType === 'sticky' ? 130 : shapeType === 'line' || shapeType === 'arrow' ? 40 : 100,
      text: shapeType === 'sticky' ? 'Single-click to type.' : shapeType === 'textbox' ? 'Click to edit text' : '',
      color: selectedColor,
      fillColor: shapeType === 'sticky' ? '#fef08a' : shapeType === 'textbox' ? 'transparent' : `${selectedColor}15`,
      borderWidth: shapeType === 'textbox' ? 0 : 2,
      borderStyle: 'solid',
      opacity: 100,
      shadow: true,
      rotation: 0,
      locked: false,
      roundedCorners: shapeType === 'rounded_rectangle' || shapeType === 'sticky'
    };

    const newSet = [...elements, newElement];
    await saveStateToDB(newSet);
    setSelectedIds(new Set([newElement.id]));
  };

  // Deletion logic
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const listToDelete = Array.from(selectedIds);
    
    // Safety lock check
    const lockedSelected = elements.some(el => selectedIds.has(el.id) && el.locked);
    if (lockedSelected) {
      alert('Some selected shapes are locked. Unlock them first.');
      return;
    }

    const filtered = elements.filter(el => {
      // Filter out elements directly selected
      if (selectedIds.has(el.id)) return false;
      // Filter out connections connected to deleted items
      if (el.type === 'connection' && (selectedIds.has(el.fromId || '') || selectedIds.has(el.toId || ''))) return false;
      return true;
    });

    // Delete in database
    for (const id of listToDelete) {
      await db.deleteWhiteboardElement(id);
    }
    
    await saveStateToDB(filtered);
    setSelectedIds(new Set());
  };

  // Copy & Paste Handlers
  const handleCopySelected = () => {
    if (selectedIds.size === 0) return;
    const copied = elements.filter(el => selectedIds.has(el.id));
    setClipboard(copied);
  };

  const handlePaste = async () => {
    if (clipboard.length === 0) return;

    const pastedElements: WhiteboardElement[] = clipboard.map(el => ({
      ...el,
      id: crypto.randomUUID(),
      x: el.x + 25,
      y: el.y + 25,
      locked: false // unlock on duplicate
    }));

    const newSet = [...elements, ...pastedElements];
    await saveStateToDB(newSet);
    setSelectedIds(new Set(pastedElements.map(el => el.id)));
  };

  const handleDuplicateSelected = async () => {
    if (selectedIds.size === 0) return;
    const selected = elements.filter(el => selectedIds.has(el.id));
    const duplicated: WhiteboardElement[] = selected.map(el => ({
      ...el,
      id: crypto.randomUUID(),
      x: el.x + 30,
      y: el.y + 30,
      locked: false
    }));

    const newSet = [...elements, ...duplicated];
    await saveStateToDB(newSet);
    setSelectedIds(new Set(duplicated.map(el => el.id)));
  };

  // Mouse Interactions
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pan' || spacePressed || e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({
        x: e.clientX - panX,
        y: e.clientY - panY
      });
      return;
    }

    // Click background to deselect or draw
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-stage')) {
      if (tool === 'draw_shape') {
        handlePlaceShape(activeShapeToDraw);
        setTool('select');
      } else {
        setSelectedIds(new Set());
        setEditingElementId(null);
        setConnectionSourceId(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
      return;
    }

    // Handles Resize Operations
    if (resizingId && resizeHandle) {
      const el = elements.find(item => item.id === resizingId);
      if (!el || el.locked) return;

      const deltaX = (e.clientX / zoom) - resizeStartSize.x;
      const deltaY = (e.clientY / zoom) - resizeStartSize.y;

      let nextW = resizeStartSize.w;
      let nextH = resizeStartSize.h;
      let nextX = el.x;
      let nextY = el.y;

      if (resizeHandle.includes('e')) {
        nextW = Math.max(30, resizeStartSize.w + deltaX);
      }
      if (resizeHandle.includes('s')) {
        nextH = Math.max(30, resizeStartSize.h + deltaY);
      }
      if (resizeHandle.includes('w')) {
        const potentialW = resizeStartSize.w - deltaX;
        if (potentialW > 30) {
          nextW = potentialW;
          nextX = (resizeStartSize.x + resizeStartSize.w) - potentialW;
        }
      }
      if (resizeHandle.includes('n')) {
        const potentialH = resizeStartSize.h - deltaY;
        if (potentialH > 30) {
          nextH = potentialH;
          nextY = (resizeStartSize.y + resizeStartSize.h) - potentialH;
        }
      }

      if (snapToGrid) {
        nextW = Math.round(nextW / 15) * 15;
        nextH = Math.round(nextH / 15) * 15;
        nextX = Math.round(nextX / 15) * 15;
        nextY = Math.round(nextY / 15) * 15;
      }

      setElements(prev => prev.map(item => 
        item.id === resizingId ? { ...item, x: nextX, y: nextY, width: nextW, height: nextH } : item
      ));
      return;
    }

    // Handles Node Dragging Operations (supports multi-select move!)
    if (draggingElementId && tool === 'select') {
      const mainEl = elements.find(item => item.id === draggingElementId);
      if (!mainEl || mainEl.locked) return;

      const nextX = (e.clientX / zoom) - dragOffset.x;
      const nextY = (e.clientY / zoom) - dragOffset.y;

      const shiftX = nextX - mainEl.x;
      const shiftY = nextY - mainEl.y;

      if (selectedIds.has(draggingElementId)) {
        // Drag all selected shapes collectively
        setElements(prev => prev.map(item => {
          if (selectedIds.has(item.id) && !item.locked) {
            let finalX = item.x + shiftX;
            let finalY = item.y + shiftY;
            if (snapToGrid) {
              finalX = Math.round(finalX / 15) * 15;
              finalY = Math.round(finalY / 15) * 15;
            }
            return { ...item, x: finalX, y: finalY };
          }
          return item;
        }));
      } else {
        // Drag individual single shape
        let finalX = nextX;
        let finalY = nextY;
        if (snapToGrid) {
          finalX = Math.round(finalX / 15) * 15;
          finalY = Math.round(finalY / 15) * 15;
        }
        setElements(prev => prev.map(item => 
          item.id === draggingElementId ? { ...item, x: finalX, y: finalY } : item
        ));
      }
    }
  };

  const handleMouseUp = async () => {
    setIsPanning(false);
    setResizingId(null);
    setResizeHandle(null);

    if (draggingElementId) {
      // Save changes to db
      await saveStateToDB(elements, false);
      setDraggingElementId(null);
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, elem: WhiteboardElement) => {
    e.stopPropagation();
    if (tool === 'connect') return;
    
    if (tool === 'select' && !elem.locked) {
      setDraggingElementId(elem.id);
      setDragOffset({
        x: (e.clientX / zoom) - elem.x,
        y: (e.clientY / zoom) - elem.y
      });
    }
  };

  // Node Selection & Edit
  const handleNodeClick = (e: React.MouseEvent, elem: WhiteboardElement) => {
    e.stopPropagation();

    if (tool === 'connect') {
      if (!connectionSourceId) {
        setConnectionSourceId(elem.id);
      } else if (connectionSourceId !== elem.id) {
        handleCreateLink(connectionSourceId, elem.id);
      }
      return;
    }

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Toggle multiselect
      const nextSelected = new Set(selectedIds);
      if (nextSelected.has(elem.id)) {
        nextSelected.delete(elem.id);
      } else {
        nextSelected.add(elem.id);
      }
      setSelectedIds(nextSelected);
    } else {
      // Single select
      setSelectedIds(new Set([elem.id]));
      
      // SINGLE CLICK EDIT: Activates editing on clicked element immediately
      if (tool === 'select' && !elem.locked) {
        setEditingElementId(elem.id);
        setEditingText(elem.text);
      }
    }
  };

  const handleCreateLink = async (sourceId: string, destId: string) => {
    try {
      const newConnection: WhiteboardElement = {
        id: crypto.randomUUID(),
        type: 'connection',
        x: 0,
        y: 0,
        text: 'Link',
        fromId: sourceId,
        toId: destId,
        color: '#3b82f6',
        borderWidth: 2,
        borderStyle: 'dashed'
      };

      const newSet = [...elements, newConnection];
      await saveStateToDB(newSet);
    } catch (err) {
      console.error(err);
    } finally {
      setConnectionSourceId(null);
      setTool('select');
    }
  };

  // Resize Trigger Initiator
  const handleResizeMouseDown = (e: React.MouseEvent, elem: WhiteboardElement, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingId(elem.id);
    setResizeHandle(handle);
    setResizeStartSize({
      x: e.clientX / zoom,
      y: e.clientY / zoom,
      w: elem.width || 100,
      h: elem.height || 100
    });
  };

  // Save Text changes (auto-saved as user types or closes)
  const handleTextChange = (text: string) => {
    setEditingText(text);
    if (editingElementId) {
      setElements(prev => prev.map(el => 
        el.id === editingElementId ? { ...el, text } : el
      ));
    }
  };

  const handleTextSave = async (id: string) => {
    const el = elements.find(item => item.id === id);
    if (el) {
      const updated = {
        ...el,
        text: editingText
      };
      const nextElements = elements.map(item => item.id === id ? updated : item);
      await saveStateToDB(nextElements, false);
    }
    setEditingElementId(null);
  };

  // Inspector Style Mutators
  const updateSelectedStyle = async (modifier: (elem: WhiteboardElement) => WhiteboardElement) => {
    const updated = elements.map(el => {
      if (selectedIds.has(el.id) && !el.locked) {
        return modifier(el);
      }
      return el;
    });
    await saveStateToDB(updated);
  };

  // Depth ordering
  const handleBringForward = async () => {
    if (selectedIds.size === 0) return;
    const items = [...elements];
    // Move selected items to the end of the array so they render last (on top)
    const selected = items.filter(el => selectedIds.has(el.id));
    const remaining = items.filter(el => !selectedIds.has(el.id));
    await saveStateToDB([...remaining, ...selected]);
  };

  const handleSendBackward = async () => {
    if (selectedIds.size === 0) return;
    const items = [...elements];
    // Move selected items to the start of the array so they render first (underneath)
    const selected = items.filter(el => selectedIds.has(el.id));
    const remaining = items.filter(el => !selectedIds.has(el.id));
    await saveStateToDB([...selected, ...remaining]);
  };

  // Star path calculation helper
  const renderStarPath = () => {
    return "M 50 5 L 63 38 L 98 38 L 70 59 L 81 92 L 50 70 L 19 92 L 30 59 L 2 38 L 37 38 Z";
  };

  // SVG Render Helper for custom shapes
  const renderShapeSVG = (elem: WhiteboardElement) => {
    const stroke = elem.color || '#3b82f6';
    const fill = elem.gradient && elem.gradientColor
      ? `url(#grad-${elem.id})`
      : elem.fillColor || 'transparent';
    const borderStyleClass = elem.borderStyle === 'dashed' ? '6,4' : elem.borderStyle === 'dotted' ? '2,2' : '';
    const strokeWidth = elem.borderWidth !== undefined ? elem.borderWidth : 2;
    const rx = elem.roundedCorners ? 12 : 0;

    // Define optional gradient SVG structures
    const gradientDef = elem.gradient && elem.gradientColor ? (
      <defs key={`def-${elem.id}`}>
        <linearGradient id={`grad-${elem.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={elem.fillColor || elem.color || '#3b82f6'} />
          <stop offset="100%" stopColor={elem.gradientColor} />
        </linearGradient>
      </defs>
    ) : null;

    let shapeMarkup = null;

    switch (elem.shape) {
      case 'circle':
        shapeMarkup = <circle cx="50%" cy="50%" r="44%" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'ellipse':
        shapeMarkup = <ellipse cx="50%" cy="50%" rx="44%" ry="34%" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'triangle':
        shapeMarkup = <polygon points="50,6 94,94 6,94" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'diamond':
      case 'decision':
        shapeMarkup = <polygon points="50,6 94,50 50,94 6,50" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'pentagon':
        shapeMarkup = <polygon points="50,6 94,38 77,92 23,92 6,38" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'hexagon':
        shapeMarkup = <polygon points="50,6 94,28 94,72 50,94 6,72 6,28" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'octagon':
        shapeMarkup = <polygon points="32,6 68,6 94,32 94,68 68,94 32,94 6,68 6,32" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'star':
        shapeMarkup = <polygon points="50,6 63,38 97,38 70,59 81,92 50,71 19,92 30,59 3,38 37,38" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'arrow':
        shapeMarkup = <path d="M 6 35 H 64 V 15 L 94 50 L 64 85 V 65 H 6 Z" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'line':
      case 'straight_line':
        shapeMarkup = <line x1="6" y1="50" x2="94" y2="50" stroke={stroke} strokeWidth={strokeWidth + 1} strokeDasharray={borderStyleClass} />;
        break;
      case 'curve':
        shapeMarkup = <path d="M 10,80 Q 50,20 90,80" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill="none" />;
        break;
      case 'callout':
      case 'speech_bubble':
        shapeMarkup = <path d="M 10 10 H 90 V 70 H 40 L 20 90 V 70 H 10 Z" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'database':
        shapeMarkup = <path d="M 10 25 C 10 15, 90 15, 90 25 V 75 C 90 85, 10 85, 10 75 Z M 10 25 C 10 35, 90 35, 90 25 M 10 50 C 10 60, 90 60, 90 50" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'document':
        shapeMarkup = <path d="M 10 6 H 65 L 90 31 V 94 H 10 Z M 65 6 V 31 H 90" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'cloud':
        shapeMarkup = <path d="M 25,40 A 15,15 0 0,1 45,25 A 20,20 0 0,1 78,28 A 15,15 0 0,1 92,48 A 15,15 0 0,1 78,72 H 25 A 15,15 0 0,1 12,56 A 15,15 0 0,1 25,40 Z" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'cylinder':
        shapeMarkup = <path d="M 10 20 C 10 10, 90 10, 90 20 V 80 C 90 90, 10 90, 10 80 Z M 10 20 C 10 30, 90 30, 90 20" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'folder':
        shapeMarkup = <path d="M 10 15 H 40 L 50 25 H 90 V 85 H 10 Z" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
        break;
      case 'textbox':
        shapeMarkup = null;
        break;
      default: // default simple rectangle
        shapeMarkup = <rect width="100%" height="100%" rx={rx} ry={rx} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={borderStyleClass} fill={fill} />;
    }

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {gradientDef}
        {shapeMarkup}
      </svg>
    );
  };

  const drawConnectorBezier = (source: WhiteboardElement, dest: WhiteboardElement) => {
    const sWidth = source.width || 120;
    const sHeight = source.height || 100;
    const dWidth = dest.width || 120;
    const dHeight = dest.height || 100;

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

  const handleZoomIn = () => setZoom(z => Math.min(2.5, z + 0.15));
  const handleZoomOut = () => setZoom(z => Math.max(0.4, z - 0.15));
  const handleZoomReset = () => { setZoom(1); setPanX(0); setPanY(0); };

  const isSelected = (id: string) => selectedIds.has(id);

  // List of professional drawing tools
  const drawingShapes = [
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'rounded_rectangle', label: 'Rounded Rectangle', icon: Square },
    { id: 'circle', label: 'Circle', icon: CircleIcon },
    { id: 'ellipse', label: 'Ellipse', icon: CircleIcon },
    { id: 'triangle', label: 'Triangle', icon: Type },
    { id: 'diamond', label: 'Diamond', icon: Type },
    { id: 'textbox', label: 'Text Box', icon: Type },
    { id: 'sticky', label: 'Sticky Note', icon: Square },
    { id: 'star', label: 'Star Shape', icon: StarIcon },
    { id: 'arrow', label: 'Block Arrow', icon: ArrowRight },
    { id: 'line', label: 'Straight Line', icon: ArrowRight },
    { id: 'curve', label: 'Curve Line', icon: ArrowRight },
    { id: 'speech_bubble', label: 'Speech Bubble', icon: Smile },
    { id: 'database', label: 'Database', icon: DatabaseIcon },
    { id: 'document', label: 'Document', icon: FileText },
    { id: 'cloud', label: 'Cloud Flow', icon: CloudIcon },
    { id: 'folder', label: 'Folder', icon: FolderClosed }
  ];

  const nodeElements = elements.filter(el => el.type !== 'connection');
  const connectionElements = elements.filter(el => el.type === 'connection');

  return (
    <div className="w-full h-[calc(100vh-140px)] flex gap-4 relative select-none">
      
      {/* 1. Left Side Toolbar for quick drawing placements */}
      <div className={`w-14 py-4 rounded-2xl border flex flex-col items-center gap-3 z-10 shadow-sm shrink-0 ${
        darkMode ? 'bg-slate-900/60 border-slate-800/80 backdrop-blur-md' : 'bg-white/80 border-slate-200 backdrop-blur-md'
      }`}>
        <button
          onClick={() => { setTool('select'); setConnectionSourceId(null); }}
          title="Selection tool (V)"
          className={`p-2 rounded-xl transition cursor-pointer ${
            tool === 'select' ? 'bg-blue-600 text-white shadow-sm' : darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MousePointer className="w-4 h-4" />
        </button>
        
        <button
          onClick={() => { setTool('pan'); setConnectionSourceId(null); }}
          title="Hand panning tool (H / Space)"
          className={`p-2 rounded-xl transition cursor-pointer ${
            tool === 'pan' ? 'bg-blue-600 text-white shadow-sm' : darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        <button
          onClick={() => { setTool('connect'); }}
          title="Connector line tool"
          className={`p-2 rounded-xl transition cursor-pointer ${
            tool === 'connect' ? 'bg-blue-600 text-white shadow-sm' : darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Link2 className="w-4 h-4" />
        </button>

        <div className="w-8 h-px bg-slate-800/60 my-1" />

        {/* Scrollable shapes quick inserter */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 w-full flex flex-col items-center">
          {drawingShapes.map((shape) => {
            const Icon = shape.icon;
            const isActive = tool === 'draw_shape' && activeShapeToDraw === shape.id;
            return (
              <button
                key={shape.id}
                onClick={() => { setTool('draw_shape'); setActiveShapeToDraw(shape.id); }}
                title={`Insert ${shape.label}`}
                className={`p-2 rounded-xl transition cursor-pointer ${
                  isActive ? 'bg-blue-600 text-white shadow-sm' : darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Interactive Infinite Vector Stage */}
      <div 
        ref={containerRef}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`flex-1 rounded-2xl border overflow-hidden relative canvas-stage ${
          isPanning || spacePressed ? 'cursor-grabbing' : tool === 'pan' ? 'cursor-grab' : 'cursor-default'
        } ${
          darkMode ? 'bg-slate-950/40 border-slate-900/60' : 'bg-slate-50 border-slate-200'
        } ${showGrid ? (darkMode ? 'grid-bg-dark' : 'grid-bg-light') : ''}`}
        style={{
          backgroundPosition: `${panX}px ${panY}px`
        }}
      >
        {/* Absolute Canvas Transform Space */}
        <div 
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`
          }}
        >
          {/* Connector SVGs */}
          <svg className="absolute overflow-visible w-full h-full inset-0 pointer-events-none">
            <defs>
              <marker id="arrow-pointer" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
              </marker>
            </defs>

            {connectionElements.map((conn) => {
              const source = elements.find(el => el.id === conn.fromId);
              const dest = elements.find(el => el.id === conn.toId);
              if (!source || !dest) return null;

              const isConnSelected = selectedIds.has(conn.id);

              return (
                <path 
                  key={conn.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([conn.id])); }}
                  d={drawConnectorBezier(source, dest)}
                  fill="none"
                  stroke={isConnSelected ? '#3b82f6' : conn.color || '#64748b'}
                  strokeWidth={isConnSelected ? 4 : conn.borderWidth || 2}
                  strokeDasharray={conn.borderStyle === 'dashed' ? '6,4' : conn.borderStyle === 'dotted' ? '2,2' : ''}
                  markerEnd="url(#arrow-pointer)"
                  className="opacity-80 transition cursor-pointer pointer-events-auto"
                />
              );
            })}
          </svg>

          {/* Canvas Node Elements */}
          {nodeElements.map((elem) => {
            const isEditing = editingElementId === elem.id;
            const width = elem.width || 120;
            const height = elem.height || 100;
            const isElSelected = isSelected(elem.id);
            const opacityStyle = (elem.opacity !== undefined ? elem.opacity : 100) / 100;

            return (
              <div
                key={elem.id}
                onMouseDown={(e) => handleNodeMouseDown(e, elem)}
                onClick={(e) => handleNodeClick(e, elem)}
                className={`absolute pointer-events-auto rounded-xl shadow-sm transition duration-150 flex flex-col justify-center items-center p-3 select-none text-center ${
                  isElSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-950 z-20' : 'hover:ring-1 hover:ring-slate-700'
                }`}
                style={{
                  left: elem.x,
                  top: elem.y,
                  width: width,
                  height: height,
                  transform: `rotate(${elem.rotation || 0}deg)`,
                  opacity: opacityStyle,
                  filter: elem.shadow ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))' : 'none',
                  cursor: elem.locked ? 'not-allowed' : 'move'
                }}
              >
                {/* Custom SVG Drawing */}
                {renderShapeSVG(elem)}

                {/* Lock Indicator */}
                {elem.locked && (
                  <div className="absolute right-2 top-2 bg-slate-950/80 p-1 rounded border border-slate-800">
                    <Lock className="w-2.5 h-2.5 text-amber-500" />
                  </div>
                )}

                {/* Inner Text Field / Input Editor */}
                <div className="absolute inset-0 flex items-center justify-center p-3 pointer-events-none w-full h-full">
                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={editingText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onBlur={() => handleTextSave(elem.id)}
                      onKeyDown={(e) => {
                        // ESC key closes editor instantly
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          handleTextSave(elem.id);
                        }
                        // Ctrl+Enter finishes editing. Standard Enter inserts line break
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleTextSave(elem.id);
                        }
                      }}
                      className="w-full h-full bg-transparent resize-none border-none focus:outline-none focus:ring-0 text-xs font-medium text-center text-slate-100 leading-relaxed font-sans scrollbar select-text pointer-events-auto"
                      style={{
                        color: elem.shape === 'sticky' ? '#1e293b' : 'inherit'
                      }}
                    />
                  ) : (
                    <div 
                      className={`text-xs font-semibold select-text leading-relaxed break-all max-h-full overflow-hidden truncate whitespace-pre-wrap ${
                        elem.shape === 'sticky' ? 'text-slate-900' : darkMode ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      {elem.text}
                    </div>
                  )}
                </div>

                {/* Resizing Interaction Handles (only when selected and unlocked) */}
                {isElSelected && !elem.locked && (
                  <>
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, elem, 'nw')}
                      className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nwse-resize z-30 pointer-events-auto shadow-sm"
                    />
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, elem, 'ne')}
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nesw-resize z-30 pointer-events-auto shadow-sm"
                    />
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, elem, 'se')}
                      className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nwse-resize z-30 pointer-events-auto shadow-sm"
                    />
                    <div 
                      onMouseDown={(e) => handleResizeMouseDown(e, elem, 'sw')}
                      className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-full cursor-nesw-resize z-30 pointer-events-auto shadow-sm"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* View Controls Overlay */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <div className={`flex border rounded-xl overflow-hidden p-0.5 shadow-sm ${
            darkMode ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white/80 border-slate-200'
          }`}>
            <button onClick={handleZoomIn} title="Zoom In" className={`p-1.5 rounded-lg transition cursor-pointer ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}><ZoomIn className="w-4 h-4" /></button>
            <button onClick={handleZoomOut} title="Zoom Out" className={`p-1.5 rounded-lg transition cursor-pointer ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}><ZoomOut className="w-4 h-4" /></button>
            <button onClick={handleZoomReset} title="Reset View" className={`px-2 text-[10px] font-mono rounded-lg transition font-bold cursor-pointer ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>100%</button>
          </div>
          
          <div className={`flex border rounded-xl overflow-hidden p-0.5 shadow-sm ${
            darkMode ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white/80 border-slate-200'
          }`}>
            <button 
              onClick={() => setShowGrid(!showGrid)} 
              title="Toggle Canvas Grid" 
              className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition font-semibold cursor-pointer ${
                showGrid ? 'bg-blue-600/10 text-blue-400' : (darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')
              }`}
            >
              Grid
            </button>
            <button 
              onClick={() => setSnapToGrid(!snapToGrid)} 
              title="Toggle Grid Snapping" 
              className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition font-semibold cursor-pointer ${
                snapToGrid ? 'bg-blue-600/10 text-blue-400' : (darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')
              }`}
            >
              Snap
            </button>
          </div>
        </div>

        {/* History Undo/Redo Floating Dashboard */}
        <div className="absolute bottom-4 left-4 flex items-center gap-3 z-10">
          <div className={`flex border rounded-xl overflow-hidden p-0.5 shadow-sm backdrop-blur-md ${
            darkMode ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white/80 border-slate-200'
          }`}>
            <button 
              onClick={handleUndo} 
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UndoIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={handleRedo} 
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
              className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <RedoIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-[10px] font-mono text-slate-500 select-none bg-slate-950/50 px-2 py-1 rounded border border-slate-900">
            • Single-click edit text • Space+drag to pan
          </div>
        </div>

      </div>

      {/* 3. Floating Shape Inspector Panel (appears on right side when objects selected) */}
      {selectedIds.size > 0 && (
        <div className={`w-64 border rounded-2xl p-4 flex flex-col gap-4 shadow-lg z-10 shrink-0 ${
          darkMode ? 'bg-slate-900/90 border-slate-800/80 text-white backdrop-blur-md' : 'bg-white border-slate-200 text-slate-800 backdrop-blur-md'
        }`}>
          <div>
            <h3 className="text-xs font-bold font-mono text-blue-500 uppercase tracking-wider">Style Inspector</h3>
            <p className="text-[10px] opacity-45">{selectedIds.size} object(s) selected</p>
          </div>

          <div className="h-px bg-slate-800/60" />

          {/* Color Fill Selector */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400">Fill Color</span>
            <div className="flex flex-wrap gap-1.5">
              {['transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff', '#fed7aa', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#ef4444'].map((col) => (
                <button
                  key={col}
                  onClick={() => updateSelectedStyle(el => ({ ...el, fillColor: col }))}
                  className="w-5 h-5 rounded-md border border-slate-700/50 cursor-pointer shadow-sm relative overflow-hidden"
                  style={{ backgroundColor: col === 'transparent' ? 'transparent' : col }}
                >
                  {col === 'transparent' && <div className="absolute inset-0 border-t border-rose-500 rotate-45" />}
                </button>
              ))}
            </div>
          </div>

          {/* Border Width & Style */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400">Border Styling</span>
            <div className="grid grid-cols-3 gap-1">
              {[0, 2, 4].map((width) => (
                <button
                  key={width}
                  onClick={() => updateSelectedStyle(el => ({ ...el, borderWidth: width }))}
                  className={`py-1 text-[10px] font-mono rounded border cursor-pointer ${
                    darkMode ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {width}px
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-3 gap-1 mt-1">
              {['solid', 'dashed', 'dotted'].map((style) => (
                <button
                  key={style}
                  onClick={() => updateSelectedStyle(el => ({ ...el, borderStyle: style as any }))}
                  className={`py-1 text-[9px] font-mono rounded border capitalize cursor-pointer ${
                    darkMode ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity Control */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>Opacity</span>
              <span>100%</span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="100" 
              step="10"
              defaultValue="100"
              onChange={(e) => updateSelectedStyle(el => ({ ...el, opacity: Number(e.target.value) }))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Rotation Control */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>Rotation</span>
              <span>Degree</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="350" 
              step="15"
              defaultValue="0"
              onChange={(e) => updateSelectedStyle(el => ({ ...el, rotation: Number(e.target.value) }))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Layering & Depths */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400">Arrangement</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleBringForward}
                className={`py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
                  darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ChevronUp className="w-3.5 h-3.5 text-blue-500" />
                Front
              </button>
              <button
                onClick={handleSendBackward}
                className={`py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
                  darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
                Back
              </button>
            </div>
          </div>

          {/* Locks, Shadows, Gradients */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const isLocked = elements.find(el => selectedIds.has(el.id))?.locked || false;
                updateSelectedStyle(el => ({ ...el, locked: !isLocked }));
              }}
              className={`py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
                darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {elements.find(el => selectedIds.has(el.id))?.locked ? (
                <>
                  <Unlock className="w-3 h-3 text-emerald-500" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-amber-500" />
                  Lock
                </>
              )}
            </button>

            <button
              onClick={() => updateSelectedStyle(el => ({ ...el, shadow: !el.shadow }))}
              className={`py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
                darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Shadow
            </button>
          </div>

          <button
            onClick={() => updateSelectedStyle(el => ({ ...el, gradient: !el.gradient, gradientColor: el.gradient ? undefined : '#00000030' }))}
            className={`w-full py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
              darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Toggle Gradient Fill
          </button>

          <div className="h-px bg-slate-800/60 my-1" />

          {/* Delete & Duplicate & Copy */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCopySelected}
                className={`py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
                  darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <CopyIcon className="w-3 h-3 text-slate-400" />
                Copy
              </button>
              <button
                onClick={handleDuplicateSelected}
                className={`py-1.5 text-[10px] font-semibold font-mono rounded-xl border flex items-center justify-center gap-1 cursor-pointer transition ${
                  darkMode ? 'bg-slate-950 border-slate-800 hover:bg-slate-850' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Duplicate
              </button>
            </div>
            
            <button
              onClick={handleDeleteSelected}
              className="w-full py-2 bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 border border-rose-900/30 rounded-xl text-[10px] font-bold font-mono transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selection
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
