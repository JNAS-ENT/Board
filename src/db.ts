import {
  DiaryEntry,
  KanbanColumn,
  KanbanCard,
  WhiteboardElement,
  Resource,
  CodeSnippet,
  RecentActivity
} from './types';

const DB_NAME = 'JNAS_Architect_Workspace';
const DB_VERSION = 1;

class WorkspaceDB {
  private db: IDBDatabase | null = null;
  public onModified: (() => void) | null = null;

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('diary')) {
          db.createObjectStore('diary', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('kanban_columns')) {
          db.createObjectStore('kanban_columns', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('kanban_cards')) {
          db.createObjectStore('kanban_cards', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('whiteboard')) {
          db.createObjectStore('whiteboard', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('resources')) {
          db.createObjectStore('resources', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('code_snippets')) {
          db.createObjectStore('code_snippets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('activities')) {
          db.createObjectStore('activities', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.seedIfNeeded().then(resolve).catch(reject);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // Generic helper for getting all items from a store
  private getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Public generic getter for dynamic syncing
  public getStoreItems<T>(storeName: string): Promise<T[]> {
    return this.getAll<T>(storeName);
  }

  // Generic helper for putting an item in a store
  private put<T>(storeName: string, item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.put(item);
        request.onsuccess = () => {
          if (this.onModified) this.onModified();
          resolve();
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Public direct bypass methods for Sync Engine to prevent recursive loop
  public putItemDirect<T>(storeName: string, item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.put(item);
        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public deleteItemDirect(storeName: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  private trackDeletion(storeName: string, id: string) {
    try {
      const pendingStr = localStorage.getItem('jnas_pending_deletes') || '[]';
      const pending = JSON.parse(pendingStr);
      pending.push({ storeName, id, timestamp: new Date().toISOString() });
      localStorage.setItem('jnas_pending_deletes', JSON.stringify(pending));
    } catch (err) {
      console.error('Error tracking deletion:', err);
    }
  }

  // Generic helper for deleting an item from a store
  private delete(storeName: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore(storeName, 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => {
          this.trackDeletion(storeName, id);
          if (this.onModified) this.onModified();
          resolve();
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- DIARY SERVICES ---
  getDiaryEntries(): Promise<DiaryEntry[]> {
    return this.getAll<DiaryEntry>('diary').then(entries =>
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  saveDiaryEntry(entry: DiaryEntry): Promise<void> {
    return this.put('diary', entry).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'diary',
        action: 'update',
        title: entry.title || 'Untitled Entry',
        details: `Saved diary entry. Content length: ${entry.content.length} characters.`,
        timestamp: new Date().toISOString()
      });
    });
  }

  deleteDiaryEntry(id: string, title: string): Promise<void> {
    return this.delete('diary', id).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'diary',
        action: 'delete',
        title: title || 'Untitled Entry',
        details: 'Deleted diary entry.',
        timestamp: new Date().toISOString()
      });
    });
  }

  // --- KANBAN SERVICES ---
  getKanbanColumns(): Promise<KanbanColumn[]> {
    return this.getAll<KanbanColumn>('kanban_columns').then(cols =>
      cols.sort((a, b) => a.order - b.order)
    );
  }

  saveKanbanColumn(col: KanbanColumn): Promise<void> {
    return this.put('kanban_columns', col);
  }

  deleteKanbanColumn(id: string): Promise<void> {
    return this.delete('kanban_columns', id);
  }

  getKanbanCards(): Promise<KanbanCard[]> {
    return this.getAll<KanbanCard>('kanban_cards').then(cards =>
      cards.sort((a, b) => a.order - b.order)
    );
  }

  saveKanbanCard(card: KanbanCard, actionType: 'create' | 'update' = 'update'): Promise<void> {
    return this.put('kanban_cards', card).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'kanban',
        action: actionType,
        title: card.title,
        details: `Task moved or updated. Progress: ${card.progress}%.`,
        timestamp: new Date().toISOString()
      });
    });
  }

  deleteKanbanCard(id: string, title: string): Promise<void> {
    return this.delete('kanban_cards', id).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'kanban',
        action: 'delete',
        title,
        details: 'Deleted Kanban task card.',
        timestamp: new Date().toISOString()
      });
    });
  }

  // --- WHITEBOARD SERVICES ---
  getWhiteboardElements(): Promise<WhiteboardElement[]> {
    return this.getAll<WhiteboardElement>('whiteboard');
  }

  saveWhiteboardElement(elem: WhiteboardElement): Promise<void> {
    return this.put('whiteboard', elem);
  }

  saveWhiteboardElements(elements: WhiteboardElement[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      const transaction = this.db.transaction('whiteboard', 'readwrite');
      const store = transaction.objectStore('whiteboard');
      
      elements.forEach(elem => {
        store.put(elem);
      });

      transaction.oncomplete = () => {
        if (this.onModified) this.onModified();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  deleteWhiteboardElement(id: string): Promise<void> {
    return this.delete('whiteboard', id);
  }

  clearWhiteboard(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      const transaction = this.db.transaction('whiteboard', 'readwrite');
      const store = transaction.objectStore('whiteboard');
      const request = store.clear();
      request.onsuccess = () => {
        if (this.onModified) this.onModified();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- RESOURCE SERVICES ---
  getResources(): Promise<Resource[]> {
    return this.getAll<Resource>('resources').then(res =>
      res.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  saveResource(res: Resource, actionType: 'create' | 'update' = 'update'): Promise<void> {
    return this.put('resources', res).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'resource',
        action: actionType,
        title: res.title,
        details: `Saved resource link under category: ${res.category}.`,
        timestamp: new Date().toISOString()
      });
    });
  }

  deleteResource(id: string, title: string): Promise<void> {
    return this.delete('resources', id).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'resource',
        action: 'delete',
        title,
        details: 'Removed resource library link.',
        timestamp: new Date().toISOString()
      });
    });
  }

  // --- CODE SNIPPETS ---
  getCodeSnippets(): Promise<CodeSnippet[]> {
    return this.getAll<CodeSnippet>('code_snippets').then(snippets =>
      snippets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  saveCodeSnippet(snippet: CodeSnippet, actionType: 'create' | 'update' = 'update'): Promise<void> {
    return this.put('code_snippets', snippet).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'code',
        action: actionType,
        title: snippet.title,
        details: `Saved snippet with syntax highlighting for: ${snippet.language}.`,
        timestamp: new Date().toISOString()
      });
    });
  }

  deleteCodeSnippet(id: string, title: string): Promise<void> {
    return this.delete('code_snippets', id).then(() => {
      this.logActivity({
        id: crypto.randomUUID(),
        type: 'code',
        action: 'delete',
        title,
        details: 'Deleted code snippet.',
        timestamp: new Date().toISOString()
      });
    });
  }

  // --- ACTIVITY SERVICES ---
  getRecentActivities(): Promise<RecentActivity[]> {
    return this.getAll<RecentActivity>('activities').then(activities =>
      activities
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 50) // Return only the last 50 activities to avoid bloat
    );
  }

  logActivity(activity: RecentActivity): Promise<void> {
    return this.put('activities', activity);
  }

  clearActivities(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      const transaction = this.db.transaction('activities', 'readwrite');
      const store = transaction.objectStore('activities');
      const request = store.clear();
      request.onsuccess = () => {
        if (this.onModified) this.onModified();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- SEED DATABASE IF EMPTY ---
  private async seedIfNeeded(): Promise<void> {
    const cols = await this.getAll<KanbanColumn>('kanban_columns');
    if (cols.length > 0) return; // DB is already seeded

    console.log('Seeding initial premium workspace template...');

    // 1. Kanban Columns
    const defaultCols: KanbanColumn[] = [
      { id: 'todo', title: 'To Do', order: 0 },
      { id: 'inprogress', title: 'In Progress', order: 1 },
      { id: 'review', title: 'Under Review', order: 2 },
      { id: 'done', title: 'Completed', order: 3 },
    ];
    for (const c of defaultCols) {
      await this.put('kanban_columns', c);
    }

    // 2. Kanban Cards
    const defaultCards: KanbanCard[] = [
      {
        id: 'card-1',
        columnId: 'todo',
        title: 'Draft System Design Architecture',
        description: 'Complete high-level schema mapping and service boundaries for the JNAS multi-agent cloud compiler.',
        progress: 0,
        deadline: '2026-08-01',
        labels: ['High Priority', 'Backend'],
        attachments: [
          { name: 'Architecture Blueprint', url: 'https://github.com/shaikh-jnas', type: 'url' }
        ],
        order: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 'card-2',
        columnId: 'inprogress',
        title: 'Optimize Database Connection Pooling',
        description: 'Mitigate connection leakage on server cold starts under variable traffic spikes.',
        progress: 65,
        deadline: '2026-07-25',
        labels: ['Performance', 'SQL'],
        attachments: [],
        order: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 'card-3',
        columnId: 'review',
        title: 'Implement Interactive Whiteboard Pan & Zoom',
        description: 'Ensure smooth 60fps tracking using SVG viewport coordinates transformations.',
        progress: 90,
        deadline: '2026-07-22',
        labels: ['UI/UX', 'Canvas'],
        attachments: [],
        order: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 'card-4',
        columnId: 'done',
        title: 'Setup Environment Variable Ingress',
        description: 'Configure and lock down .env parser secrets via hardware security module keychains.',
        progress: 100,
        deadline: '2026-07-19',
        labels: ['Security', 'DevOps'],
        attachments: [],
        order: 0,
        createdAt: new Date().toISOString()
      }
    ];
    for (const card of defaultCards) {
      await this.put('kanban_cards', card);
    }

    // 3. Diary Entries
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const defaultDiary: DiaryEntry[] = [
      {
        id: 'diary-1',
        title: 'System Architecture & Goals',
        content: `# Project JNAS: Workspace Suite Architecture

${formattedDate} • ${formattedTime}
Started architectural drafting of the productivity applet.

## Goal Specifications
1. **Local-First Speed**: Leverage IndexedDB for lightning-fast database performance (< 10ms read cycles).
2. **Offline Resilience**: Absolute operation without cloud telemetry. No tracking, zero bloat.
3. **Interactive Visualizers**: Rich diagramming via Infinite Whiteboard connections.

## Engineering Stack
- Core Engine: React 19, TypeScript
- Styles: Tailwind CSS
- Animation Frame: motion/react`,
        createdAt: new Date(now.getTime() - 3600000).toISOString(),
        updatedAt: new Date(now.getTime() - 3600000).toISOString()
      }
    ];
    for (const entry of defaultDiary) {
      await this.put('diary', entry);
    }

    // 4. Whiteboard elements
    const defaultWhiteboard: WhiteboardElement[] = [
      {
        id: 'wb-node-1',
        type: 'mindmap_node',
        x: 400,
        y: 200,
        width: 180,
        height: 60,
        text: 'Main App Idea',
        color: '#3B82F6',
        shape: 'rectangle'
      },
      {
        id: 'wb-node-2',
        type: 'mindmap_node',
        x: 200,
        y: 350,
        width: 150,
        height: 80,
        text: 'Dashboard\n(Local Metrics)',
        color: '#10B981',
        shape: 'circle'
      },
      {
        id: 'wb-node-3',
        type: 'mindmap_node',
        x: 600,
        y: 350,
        width: 150,
        height: 80,
        text: 'Kanban Board\n(Task Flow)',
        color: '#8B5CF6',
        shape: 'circle'
      },
      {
        id: 'wb-conn-1',
        type: 'connection',
        x: 0,
        y: 0,
        text: 'Feeds Info',
        fromId: 'wb-node-1',
        toId: 'wb-node-2'
      },
      {
        id: 'wb-conn-2',
        type: 'connection',
        x: 0,
        y: 0,
        text: 'Tracks Status',
        fromId: 'wb-node-1',
        toId: 'wb-node-3'
      },
      {
        id: 'wb-sticky-1',
        type: 'sticky',
        x: 380,
        y: 450,
        width: 160,
        height: 160,
        text: 'Local-first priority: Avoid roundtrips! Cache state in memory and flush to IndexedDB.',
        color: '#F59E0B'
      }
    ];
    for (const elem of defaultWhiteboard) {
      await this.put('whiteboard', elem);
    }

    // 5. Code Snippets
    const defaultSnippets: CodeSnippet[] = [
      {
        id: 'snippet-1',
        title: 'TypeScript IndexedDB Wrapper',
        language: 'typescript',
        code: `export function openDatabase(name: string, version: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}`,
        notes: 'Promisified IndexedDB initialization. Essential for clean async-await flows.',
        createdAt: new Date(now.getTime() - 7200000).toISOString()
      },
      {
        id: 'snippet-2',
        title: 'Tailwind Centered Grid Layout',
        language: 'html',
        code: `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
  <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm hover:border-slate-700 transition">
    <!-- Card Content -->
  </div>
</div>`,
        notes: 'Responsive bento-grid styling pattern for standard dark components.',
        createdAt: new Date(now.getTime() - 10800000).toISOString()
      }
    ];
    for (const snip of defaultSnippets) {
      await this.put('code_snippets', snip);
    }

    // 6. Resource Library
    const defaultResources: Resource[] = [
      {
        id: 'res-1',
        title: 'Git Repository — JNAS Architect Github Workspace',
        url: 'https://github.com/shaikh-jnas',
        category: 'github',
        notes: 'Active workspace containing build pipelines, workflow automations, and CI test runner blueprints.',
        metadata: {
          description: 'Official code repositories, system engineering templates, and deployment scripts.',
          author: 'Shaikh JNAS',
          stars: 125
        },
        createdAt: new Date(now.getTime() - 14400000).toISOString()
      },
      {
        id: 'res-2',
        title: 'SVG Viewport Coordinate Math — Tutorial',
        url: 'https://youtube.com/watch?v=SVGViewportCoordinateMath',
        category: 'youtube',
        notes: 'Excellent math walkthrough explaining zoom matrix transformations for custom infinite canvas vectors.',
        metadata: {
          description: 'Learn how to transform client mouse coordinates into SVG viewport space for fluid zooming and panning.',
          author: 'Interactive Vector Guides',
          videoDuration: '14:25'
        },
        createdAt: new Date(now.getTime() - 18000000).toISOString()
      }
    ];
    for (const res of defaultResources) {
      await this.put('resources', res);
    }

    // 7. Recent Activities
    const defaultActivities: RecentActivity[] = [
      {
        id: crypto.randomUUID(),
        type: 'diary',
        action: 'create',
        title: 'Initial Diary Log',
        details: 'Architectural overview of JNAS Workspace written.',
        timestamp: new Date(now.getTime() - 3600000).toISOString()
      },
      {
        id: crypto.randomUUID(),
        type: 'kanban',
        action: 'create',
        title: 'Kanban Board Populated',
        details: 'Added initial workflow tasks: system designs, DB connections, and interactive whiteboard.',
        timestamp: new Date(now.getTime() - 1800000).toISOString()
      },
      {
        id: crypto.randomUUID(),
        type: 'whiteboard',
        action: 'create',
        title: 'Visual Architecture Mindmap',
        details: 'Initialized infinite canvas nodes mapping out Dashboard and Kanban connections.',
        timestamp: new Date(now.getTime() - 900000).toISOString()
      }
    ];
    for (const act of defaultActivities) {
      await this.put('activities', act);
    }

    console.log('Database seeded successfully.');
  }

  // --- DATABASE EXPORT / IMPORT (For backup and drive sync) ---
  async exportDB(): Promise<string> {
    const data = {
      diary: await this.getAll('diary'),
      kanban_columns: await this.getAll('kanban_columns'),
      kanban_cards: await this.getAll('kanban_cards'),
      whiteboard: await this.getAll('whiteboard'),
      resources: await this.getAll('resources'),
      code_snippets: await this.getAll('code_snippets'),
      activities: await this.getAll('activities'),
    };
    return JSON.stringify(data, null, 2);
  }

  async importDB(jsonStr: string): Promise<void> {
    const data = JSON.parse(jsonStr);
    
    if (!this.db) throw new Error('Database not initialized');

    // Helper to empty and fill a store
    const overwriteStore = async (storeName: string, items: any[]) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => {
          items.forEach(item => store.put(item));
        };
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    };

    if (data.diary) await overwriteStore('diary', data.diary);
    if (data.kanban_columns) await overwriteStore('kanban_columns', data.kanban_columns);
    if (data.kanban_cards) await overwriteStore('kanban_cards', data.kanban_cards);
    if (data.whiteboard) await overwriteStore('whiteboard', data.whiteboard);
    if (data.resources) await overwriteStore('resources', data.resources);
    if (data.code_snippets) await overwriteStore('code_snippets', data.code_snippets);
    if (data.activities) await overwriteStore('activities', data.activities);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jnas_db_updated'));
    }
  }
}

export const db = new WorkspaceDB();
