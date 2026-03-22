export interface ImageItem {
  id: number;
  filename: string;
  storage_path: string;
  label: string | null;
  reviewed: boolean;
}

export interface LabelStats {
  total_images: number;
  labeled: number;
  unlabeled: number;
  target_plant: number;
  other: number;
  reviewed: number;
}

export interface PaginatedImages {
  items: ImageItem[];
  page: number;
  total_pages: number;
  total: number;
}

export interface LabelOp {
  created_at?: string;
  operation_id: string;
  changed_items?: number;
  newly_labeled_items?: number;
  relabeled_items?: number;
}

export interface ModelRow {
  version: string;
  created_at?: string | null;
  metrics?: unknown;
  is_published?: boolean;
}

export interface InferReviewItem {
  image_id: number | null;
  filename?: string;
  path?: string;
  predicted_class?: string;
  confidence?: number;
  current_label?: string;
  reviewed?: boolean;
}

export interface SelectedInfo {
  label: string | null;
  reviewed: boolean;
}
