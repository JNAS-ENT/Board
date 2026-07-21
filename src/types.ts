export interface DiaryEntry {
  id: string;
  title: string;
  content: string; // Markdown containing timestamps
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface KanbanColumn {
  id: string;
  title: string;
  order: number;
}

export interface KanbanAttachment {
  name: string;
  url: string;
  type: 'url' | 'file';
}

export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  description: string;
  progress: number; // 0 to 100
  deadline?: string; // YYYY-MM-DD
  labels: string[];
  attachments: KanbanAttachment[];
  order: number;
  createdAt: string;
}

export interface WhiteboardElement {
  id: string;
  type: 'sticky' | 'mindmap_node' | 'connection';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  color?: string; // Hex or tailwind color class
  shape?: 'rectangle' | 'circle' | 'diamond';
  fromId?: string; // For connections
  toId?: string; // For connections
  groupId?: string;
}

export interface ResourceMetadata {
  description?: string;
  thumbnailUrl?: string;
  author?: string;
  language?: string;
  stars?: number;
  videoDuration?: string;
}

export interface Resource {
  id: string;
  title: string;
  url: string;
  category: 'url' | 'pdf' | 'image' | 'github' | 'youtube' | 'document';
  notes: string;
  metadata?: ResourceMetadata;
  createdAt: string;
}

export interface CodeSnippet {
  id: string;
  title: string;
  code: string;
  language: string;
  notes: string;
  createdAt: string;
}

export interface RecentActivity {
  id: string;
  type: 'diary' | 'kanban' | 'whiteboard' | 'resource' | 'code';
  action: 'create' | 'update' | 'delete';
  title: string;
  details: string;
  timestamp: string;
}
