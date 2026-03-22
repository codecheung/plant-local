import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, prettyJson } from '@/api/client';
import { BATCH_CONFIRM_THRESHOLD, FILTER_STATE_KEY } from './constants';
import type {
  ImageItem,
  InferReviewItem,
  LabelOp,
  LabelStats,
  ModelRow,
  SelectedInfo,
} from './types';
import { isTerminalStatus } from './utils';

function getFilterSnapshot(p: {
  keyword: string;
  filterStatus: string;
  filterLabel: string;
  filterReviewed: string;
  page: string;
  pageSize: string;
  randomCount: string;
}) {
  return {
    keyword: p.keyword,
    filterStatus: p.filterStatus,
    filterLabel: p.filterLabel,
    filterReviewed: p.filterReviewed,
    page: p.page,
    pageSize: p.pageSize,
    randomCount: p.randomCount,
  };
}

export function usePlantConsole() {
  const [stats, setStats] = useState<LabelStats | null>(null);
  const [importMsg, setImportMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterReviewed, setFilterReviewed] = useState('');
  const [page, setPage] = useState('1');
  const [pageSize, setPageSize] = useState('20');
  const [randomCount, setRandomCount] = useState('20');
  const [quickMode, setQuickMode] = useState(false);

  const [currentImageItems, setCurrentImageItems] = useState<ImageItem[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [selectedImageInfo, setSelectedImageInfo] = useState<
    Map<number, SelectedInfo>
  >(() => new Map());

  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const pendingFocusIndex = useRef<number | null>(null);

  const [pageMeta, setPageMeta] = useState('');
  const [serverPage, setServerPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalImageCount, setTotalImageCount] = useState(0);

  const [opLogLimit, setOpLogLimit] = useState('20');
  const [opLogs, setOpLogs] = useState<LabelOp[]>([]);

  const [trainMode, setTrainMode] = useState('new');
  const [baseVersion, setBaseVersion] = useState('');
  const [trainJobId, setTrainJobId] = useState('');
  const [trainMsg, setTrainMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [trainStatusText, setTrainStatusText] = useState('');

  const [inferModelVersion, setInferModelVersion] = useState('');
  const [inferInputDir, setInferInputDir] = useState('');
  const [inferJobId, setInferJobId] = useState('');
  const [inferMsg, setInferMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [inferStatusText, setInferStatusText] = useState('');

  const [reviewJobId, setReviewJobId] = useState('');
  const [reviewPredClass, setReviewPredClass] = useState('');
  const [reviewSortOrder, setReviewSortOrder] = useState('asc');
  const [reviewLimit, setReviewLimit] = useState('200');
  const [reviewMeta, setReviewMeta] = useState('');
  const [inferReviewItems, setInferReviewItems] = useState<InferReviewItem[]>(
    [],
  );

  const [models, setModels] = useState<ModelRow[]>([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const previewOpenRef = useRef(false);
  useEffect(() => {
    previewOpenRef.current = previewOpen;
  }, [previewOpen]);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const pendingPreviewIndex = useRef<number | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const previewDragging = useRef(false);
  const previewDragStart = useRef({ x: 0, y: 0 });
  const previewDragBase = useRef({ x: 0, y: 0 });
  const [previewOnlyUnreviewed, setPreviewOnlyUnreviewed] = useState(false);

  const [undoSteps, setUndoSteps] = useState('1');

  const trainPoller = useRef<ReturnType<typeof setInterval> | null>(null);
  const inferPoller = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUploadTrigger = useRef<'files' | 'folder'>('files');

  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const saveFilterState = useCallback(() => {
    try {
      localStorage.setItem(
        FILTER_STATE_KEY,
        JSON.stringify(
          getFilterSnapshot({
            keyword,
            filterStatus,
            filterLabel,
            filterReviewed,
            page,
            pageSize,
            randomCount,
          }),
        ),
      );
    } catch {
      /* ignore */
    }
  }, [
    keyword,
    filterStatus,
    filterLabel,
    filterReviewed,
    page,
    pageSize,
    randomCount,
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_STATE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as Record<string, string>;
      const keys = [
        'keyword',
        'filterStatus',
        'filterLabel',
        'filterReviewed',
        'page',
        'pageSize',
        'randomCount',
      ] as const;
      for (const key of keys) {
        if (state[key] == null) continue;
        const v = String(state[key]);
        if (key === 'keyword') setKeyword(v);
        if (key === 'filterStatus') setFilterStatus(v);
        if (key === 'filterLabel') setFilterLabel(v);
        if (key === 'filterReviewed') setFilterReviewed(v);
        if (key === 'page') setPage(v);
        if (key === 'pageSize') setPageSize(v);
        if (key === 'randomCount') setRandomCount(v);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const stopTrainPolling = useCallback(() => {
    if (trainPoller.current) {
      clearInterval(trainPoller.current);
      trainPoller.current = null;
    }
  }, []);

  const stopInferPolling = useCallback(() => {
    if (inferPoller.current) {
      clearInterval(inferPoller.current);
      inferPoller.current = null;
    }
  }, []);

  const refreshStats = useCallback(async () => {
    const data = await api<LabelStats>('/api/labels/stats');
    setStats(data);
  }, []);

  const syncInfoFromItems = useCallback((items: ImageItem[]) => {
    setSelectedImageInfo((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        next.set(item.id, { label: item.label, reviewed: item.reviewed });
      }
      return next;
    });
  }, []);

  const normalizeFocusIndex = useCallback((items: ImageItem[], idx: number) => {
    if (!items.length) return -1;
    let i = idx;
    if (pendingFocusIndex.current != null) {
      i = Math.min(Math.max(0, pendingFocusIndex.current), items.length - 1);
      pendingFocusIndex.current = null;
    } else {
      if (i < 0) i = 0;
      if (i >= items.length) i = items.length - 1;
    }
    return i;
  }, []);

  const refreshImages = useCallback(async () => {
    saveFilterState();
    const p = Number(page || 1);
    const ps = Number(pageSize || 20);
    const q = new URLSearchParams();
    q.set('page', String(p));
    q.set('page_size', String(ps));
    const kw = keyword.trim();
    if (kw) q.set('keyword', kw);
    if (filterStatus) q.set('status', filterStatus);
    if (filterLabel) q.set('label', filterLabel);
    if (filterReviewed) q.set('reviewed', filterReviewed);

    const data = await api<{
      items: ImageItem[];
      page: number;
      total_pages: number;
      total: number;
    }>(`/api/images?${q.toString()}`);

    const items = data.items || [];
    setCurrentImageItems(items);
    syncInfoFromItems(items);
    setServerPage(data.page || 1);
    setTotalPages(data.total_pages || 0);
    setTotalImageCount(data.total ?? 0);
    setPageMeta(
      `共 ${data.total} 条，第 ${data.page}/${Math.max(1, data.total_pages)} 页`,
    );
    setFocusedRowIndex((prev) => normalizeFocusIndex(items, prev));
  }, [
    saveFilterState,
    page,
    pageSize,
    keyword,
    filterStatus,
    filterLabel,
    filterReviewed,
    syncInfoFromItems,
    normalizeFocusIndex,
  ]);

  const randomUnlabeled = useCallback(async () => {
    saveFilterState();
    const count = Math.max(1, Math.min(200, Number(randomCount || 20)));
    const data = await api<{ items: ImageItem[]; count: number }>(
      `/api/images/random-unlabeled?count=${count}`,
    );
    const items = data.items || [];
    setCurrentImageItems(items);
    syncInfoFromItems(items);
    setServerPage(1);
    setTotalPages(0);
    setTotalImageCount(data.count ?? items.length);
    setPageMeta(`随机待标注 ${data.count} 条`);
    setFocusedRowIndex((prev) => normalizeFocusIndex(items, prev));
  }, [saveFilterState, randomCount, syncInfoFromItems, normalizeFocusIndex]);

  const refreshLabelOperations = useCallback(async () => {
    const limit = Math.max(1, Math.min(100, Number(opLogLimit || 20)));
    const data = await api<{ items: LabelOp[] }>(
      `/api/label/operations?limit=${limit}`,
    );
    setOpLogs(data.items || []);
  }, [opLogLimit]);

  const refreshModels = useCallback(async () => {
    const data = await api<{ items: ModelRow[] }>('/api/model/list');
    setModels(data.items || []);
  }, []);

  const saveLabel = useCallback(
    async (imageId: number, label: string, reviewed = true) => {
      try {
        await api('/api/label/save', {
          method: 'POST',
          body: JSON.stringify({
            items: [{ image_id: imageId, label, reviewed }],
          }),
        });
        await Promise.all([
          refreshImages(),
          refreshStats(),
          refreshLabelOperations(),
        ]);
        if (previewOpenRef.current && pendingPreviewIndex.current != null) {
          setPreviewIndex(pendingPreviewIndex.current);
          pendingPreviewIndex.current = null;
        }
      } catch (e) {
        pendingPreviewIndex.current = null;
        window.alert('标注失败: ' + (e as Error).message);
        throw e;
      }
    },
    [refreshImages, refreshStats, refreshLabelOperations],
  );

  const batchSaveLabel = useCallback(
    async (label: string | null, reviewed: boolean | null) => {
      const ids = [...selectedImageIds];
      if (!ids.length) {
        window.alert('请先选择至少一条图片');
        return;
      }
      if (ids.length >= BATCH_CONFIRM_THRESHOLD) {
        const action = label ? `批量标注为 ${label}` : '批量设置已复核';
        const ok = window.confirm(
          `即将${action}，共 ${ids.length} 条，是否继续？`,
        );
        if (!ok) return;
      }

      const items = ids.map((id) => {
        const cur = selectedImageInfo.get(id);
        const currentLabel = cur?.label ? cur.label : 'other';
        const currentReviewed = !!cur?.reviewed;
        return {
          image_id: id,
          label: label || currentLabel,
          reviewed: reviewed === null ? currentReviewed : reviewed,
        };
      });

      try {
        await api('/api/label/save', {
          method: 'POST',
          body: JSON.stringify({ items }),
        });
        await Promise.all([
          refreshImages(),
          refreshStats(),
          refreshLabelOperations(),
        ]);
      } catch (e) {
        window.alert('批量保存失败: ' + (e as Error).message);
      }
    },
    [
      selectedImageIds,
      selectedImageInfo,
      refreshImages,
      refreshStats,
      refreshLabelOperations,
    ],
  );

  const undoLabels = useCallback(
    async (steps: number) => {
      try {
        const s = Math.max(1, Math.min(20, Number(steps) || 1));
        if (s >= 3) {
          const ok = window.confirm(`将撤销最近 ${s} 次标注操作，是否继续？`);
          if (!ok) return;
        }
        const data = await api<{
          operations_undone: number;
          reverted_items: number;
        }>('/api/label/undo', {
          method: 'POST',
          body: JSON.stringify({ steps: s }),
        });
        await Promise.all([
          refreshImages(),
          refreshStats(),
          refreshLabelOperations(),
        ]);
        window.alert(
          `已撤销 ${data.operations_undone} 次操作，恢复 ${data.reverted_items} 条`,
        );
      } catch (e) {
        window.alert('撤销失败: ' + (e as Error).message);
      }
    },
    [refreshImages, refreshStats, refreshLabelOperations],
  );

  const goToAbsolutePage = useCallback(
    async (targetPage: number) => {
      if (totalPages === 0 && totalImageCount > 0) {
        return;
      }
      let next = Math.max(1, Math.floor(targetPage));
      if (totalPages > 0) {
        next = Math.min(totalPages, next);
      }
      const current = Number(page || 1);
      if (next === current) return;
      setPage(String(next));
      saveFilterState();
      const ps = Number(pageSize || 20);
      const q = new URLSearchParams();
      q.set('page', String(next));
      q.set('page_size', String(ps));
      const kw = keyword.trim();
      if (kw) q.set('keyword', kw);
      if (filterStatus) q.set('status', filterStatus);
      if (filterLabel) q.set('label', filterLabel);
      if (filterReviewed) q.set('reviewed', filterReviewed);
      const data = await api<{
        items: ImageItem[];
        page: number;
        total_pages: number;
        total: number;
      }>(`/api/images?${q.toString()}`);
      const items = data.items || [];
      setCurrentImageItems(items);
      syncInfoFromItems(items);
      setServerPage(data.page || 1);
      setTotalPages(data.total_pages || 0);
      setTotalImageCount(data.total ?? 0);
      setPageMeta(
        `共 ${data.total} 条，第 ${data.page}/${Math.max(1, data.total_pages)} 页`,
      );
      setFocusedRowIndex((prev) => normalizeFocusIndex(items, prev));
    },
    [
      page,
      totalPages,
      totalImageCount,
      pageSize,
      keyword,
      filterStatus,
      filterLabel,
      filterReviewed,
      saveFilterState,
      syncInfoFromItems,
      normalizeFocusIndex,
    ],
  );

  const gotoPage = useCallback(
    async (delta: number) => {
      const current = Number(page || 1);
      await goToAbsolutePage(current + delta);
    },
    [page, goToAbsolutePage],
  );

  const getItemReviewedState = useCallback(
    (item: ImageItem) => {
      const info = selectedImageInfo.get(item.id);
      return !!(info?.reviewed ?? item.reviewed);
    },
    [selectedImageInfo],
  );

  const findUnreviewedPreviewIndex = useCallback(
    (startIndex: number, direction: number) => {
      const n = currentImageItems.length;
      if (!n) return -1;
      const step = direction >= 0 ? 1 : -1;
      for (let i = startIndex + step; i >= 0 && i < n; i += step) {
        const item = currentImageItems[i];
        if (item && !getItemReviewedState(item)) return i;
      }
      return -1;
    },
    [currentImageItems, getItemReviewedState],
  );

  const getUnreviewedRemainCount = useCallback(() => {
    if (!currentImageItems.length) return 0;
    let c = 0;
    for (const item of currentImageItems) {
      if (!getItemReviewedState(item)) c += 1;
    }
    return c;
  }, [currentImageItems, getItemReviewedState]);

  const resetPreviewTransform = useCallback(() => {
    setPreviewScale(1);
    setPreviewOffset({ x: 0, y: 0 });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    previewDragging.current = false;
  }, []);

  const onPreviewMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!previewOpenRef.current) return;
      previewDragging.current = true;
      previewDragStart.current = { x: e.clientX, y: e.clientY };
      previewDragBase.current = { x: previewOffset.x, y: previewOffset.y };
    },
    [previewOffset.x, previewOffset.y],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!previewDragging.current) return;
      setPreviewOffset({
        x: previewDragBase.current.x + (e.clientX - previewDragStart.current.x),
        y: previewDragBase.current.y + (e.clientY - previewDragStart.current.y),
      });
    };
    const onUp = () => {
      previewDragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const openPreviewByIndex = useCallback(
    (index: number) => {
      if (!currentImageItems.length) return;
      setPreviewOpen(true);
      let idx = Math.min(Math.max(0, index), currentImageItems.length - 1);
      if (previewOnlyUnreviewed) {
        const cur = currentImageItems[idx];
        if (cur && getItemReviewedState(cur)) {
          const forward = findUnreviewedPreviewIndex(idx - 1, 1);
          if (forward >= 0) idx = forward;
          else {
            const backward = findUnreviewedPreviewIndex(idx + 1, -1);
            if (backward >= 0) idx = backward;
          }
        }
      }
      setPreviewIndex(idx);
      resetPreviewTransform();
    },
    [
      currentImageItems,
      previewOnlyUnreviewed,
      getItemReviewedState,
      findUnreviewedPreviewIndex,
      resetPreviewTransform,
    ],
  );

  const navigatePreview = useCallback(
    (delta: number) => {
      if (!previewOpen || !currentImageItems.length) return;
      if (previewOnlyUnreviewed) {
        const dir = delta >= 0 ? 1 : -1;
        const next = findUnreviewedPreviewIndex(previewIndex, dir);
        if (next < 0) {
          window.alert(
            dir > 0 ? '后面没有未复核图片了' : '前面没有未复核图片了',
          );
          return;
        }
        setPreviewIndex(next);
        resetPreviewTransform();
        return;
      }
      setPreviewIndex((i) =>
        Math.min(Math.max(0, i + delta), currentImageItems.length - 1),
      );
      resetPreviewTransform();
    },
    [
      previewOpen,
      currentImageItems,
      previewOnlyUnreviewed,
      previewIndex,
      findUnreviewedPreviewIndex,
      resetPreviewTransform,
    ],
  );

  const navigatePreviewUnreviewed = useCallback(
    (direction: number) => {
      if (!previewOpen || !currentImageItems.length) return;
      const idx = findUnreviewedPreviewIndex(previewIndex, direction);
      if (idx < 0) {
        window.alert(
          direction > 0 ? '后面没有未复核图片了' : '前面没有未复核图片了',
        );
        return;
      }
      setPreviewIndex(idx);
      resetPreviewTransform();
    },
    [
      previewOpen,
      currentImageItems,
      previewIndex,
      findUnreviewedPreviewIndex,
      resetPreviewTransform,
    ],
  );

  const zoomPreview = useCallback(
    (multiplier: number) => {
      if (!previewOpen) return;
      setPreviewScale((s) => Math.max(0.2, Math.min(8, s * multiplier)));
    },
    [previewOpen],
  );

  const previewLabelCurrent = useCallback(
    async (lbl: string) => {
      if (!previewOpen || !currentImageItems.length) return;
      const item = currentImageItems[previewIndex];
      if (!item) return;
      if (previewOnlyUnreviewed) {
        const nextIdx = findUnreviewedPreviewIndex(previewIndex, 1);
        pendingPreviewIndex.current = nextIdx >= 0 ? nextIdx : previewIndex;
      } else {
        pendingPreviewIndex.current = Math.min(
          previewIndex + 1,
          currentImageItems.length - 1,
        );
      }
      await saveLabel(item.id, lbl, true);
    },
    [
      previewOpen,
      currentImageItems,
      previewIndex,
      previewOnlyUnreviewed,
      findUnreviewedPreviewIndex,
      saveLabel,
    ],
  );

  const previewReviewCurrent = useCallback(async () => {
    if (!previewOpen || !currentImageItems.length) return;
    const item = currentImageItems[previewIndex];
    if (!item) return;
    const info = selectedImageInfo.get(item.id);
    const lbl = info?.label ? info.label : 'other';
    if (previewOnlyUnreviewed) {
      const nextIdx = findUnreviewedPreviewIndex(previewIndex, 1);
      pendingPreviewIndex.current = nextIdx >= 0 ? nextIdx : previewIndex;
    }
    await saveLabel(item.id, lbl, true);
  }, [
    previewOpen,
    currentImageItems,
    previewIndex,
    selectedImageInfo,
    previewOnlyUnreviewed,
    findUnreviewedPreviewIndex,
    saveLabel,
  ]);

  const quickLabelCurrent = useCallback(
    async (lbl: string) => {
      if (!currentImageItems.length) return;
      const idx = normalizeFocusIndex(currentImageItems, focusedRowIndex);
      const item = currentImageItems[idx];
      if (!item) return;
      pendingFocusIndex.current = Math.min(
        idx + 1,
        currentImageItems.length - 1,
      );
      await saveLabel(item.id, lbl, true);
    },
    [currentImageItems, focusedRowIndex, normalizeFocusIndex, saveLabel],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      if (!currentImageItems.length) return;
      setFocusedRowIndex((prev) => {
        const base = normalizeFocusIndex(currentImageItems, prev);
        return Math.min(
          Math.max(0, base + delta),
          currentImageItems.length - 1,
        );
      });
    },
    [currentImageItems, normalizeFocusIndex],
  );

  const toggleItemSelection = useCallback((id: number, checked: boolean) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const queryTrainStatus = useCallback(
    async (id: number) => {
      const data = await api<{ status: string }>(`/api/train/${id}`);
      setTrainStatusText(prettyJson(data));
      if (isTerminalStatus(data.status)) {
        stopTrainPolling();
        await refreshModels();
        await refreshStats();
      }
      return data;
    },
    [stopTrainPolling, refreshModels, refreshStats],
  );

  const startTrainPolling = useCallback(
    (jobId: number) => {
      stopTrainPolling();
      trainPoller.current = setInterval(async () => {
        try {
          await queryTrainStatus(jobId);
        } catch {
          stopTrainPolling();
        }
      }, 2000);
    },
    [stopTrainPolling, queryTrainStatus],
  );

  const queryInferStatus = useCallback(
    async (id: number) => {
      const data = await api<{ status: string }>(`/api/infer/${id}`);
      setInferStatusText(prettyJson(data));
      if (isTerminalStatus(data.status)) {
        stopInferPolling();
        await refreshModels();
        if (data.status === 'success') {
          setReviewJobId(String(id));
        }
      }
      return data;
    },
    [stopInferPolling, refreshModels],
  );

  const startInferPolling = useCallback(
    (jobId: number) => {
      stopInferPolling();
      inferPoller.current = setInterval(async () => {
        try {
          await queryInferStatus(jobId);
        } catch {
          stopInferPolling();
        }
      }, 2000);
    },
    [stopInferPolling, queryInferStatus],
  );

  const loadInferReviewResults = useCallback(async () => {
    const jobId = Number(reviewJobId || 0);
    if (!jobId) {
      setReviewMeta('请先输入识别任务编号');
      return;
    }
    try {
      const q = new URLSearchParams();
      q.set('sort_order', reviewSortOrder || 'asc');
      if (reviewPredClass) q.set('predicted_class', reviewPredClass);
      q.set(
        'limit',
        String(Math.max(1, Math.min(5000, Number(reviewLimit || 200)))),
      );
      const data = await api<{
        items: InferReviewItem[];
        total: number;
        job_status: string;
      }>(`/api/infer/${jobId}/results/review?${q.toString()}`);
      setInferReviewItems(data.items || []);
      setReviewMeta(
        `任务 ${jobId}，状态 ${data.job_status}，共 ${data.total} 条`,
      );
    } catch (e) {
      setReviewMeta('加载失败: ' + (e as Error).message);
    }
  }, [reviewJobId, reviewSortOrder, reviewPredClass, reviewLimit]);

  const fixReviewLabel = useCallback(
    async (imageId: number, lbl: string) => {
      try {
        await api('/api/label/save', {
          method: 'POST',
          body: JSON.stringify({
            items: [{ image_id: imageId, label: lbl, reviewed: true }],
          }),
        });
        await Promise.all([
          refreshStats(),
          refreshImages(),
          refreshLabelOperations(),
          loadInferReviewResults(),
        ]);
      } catch (e) {
        window.alert('纠正失败: ' + (e as Error).message);
      }
    },
    [
      refreshStats,
      refreshImages,
      refreshLabelOperations,
      loadInferReviewResults,
    ],
  );

  const publishModel = useCallback(
    async (version: string) => {
      try {
        await api('/api/model/publish', {
          method: 'POST',
          body: JSON.stringify({ version }),
        });
        await refreshModels();
        window.alert('发布成功: ' + version);
      } catch (e) {
        window.alert('发布失败: ' + (e as Error).message);
      }
    },
    [refreshModels],
  );

  const uploadPickedFiles = useCallback(
    async (files: FileList | File[], trigger: 'files' | 'folder') => {
      const list = Array.from(files as ArrayLike<File>);
      if (!list.length) {
        setImportMsg({ ok: false, text: '请先选择要上传的图片或文件夹' });
        return;
      }
      setLoadingKey(`upload-${trigger}`);
      const form = new FormData();
      for (const f of list) form.append('files', f);
      try {
        const data = await api<{
          imported: number;
          duplicates: number;
          skipped: number;
        }>('/api/data/upload-files', {
          method: 'POST',
          body: form,
        });
        setImportMsg({
          ok: true,
          text: `上传完成：新增 ${data.imported}，重复 ${data.duplicates}，跳过 ${data.skipped}`,
        });
        await Promise.all([refreshStats(), refreshImages()]);
      } catch (e) {
        setImportMsg({ ok: false, text: '上传失败: ' + (e as Error).message });
      } finally {
        setLoadingKey(null);
      }
    },
    [refreshStats, refreshImages],
  );

  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const pickFiles = useCallback(() => {
    lastUploadTrigger.current = 'files';
    filesInputRef.current?.click();
  }, []);

  const pickFolder = useCallback(() => {
    lastUploadTrigger.current = 'folder';
    folderInputRef.current?.click();
  }, []);

  const onFilesChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      await uploadPickedFiles(files, lastUploadTrigger.current);
      e.target.value = '';
    },
    [uploadPickedFiles],
  );

  const bootstrap = useCallback(async () => {
    await Promise.all([
      refreshStats(),
      refreshImages(),
      refreshModels(),
      refreshLabelOperations(),
    ]);
  }, [refreshStats, refreshImages, refreshModels, refreshLabelOperations]);

  useEffect(() => {
    bootstrap().catch((e) => {
      const msg = (e as Error).message || String(e);
      window.alert(
        `初始化失败: ${msg}\n\n请确认后端已启动，例如：\nuvicorn backend.app.main:app --reload\n\n开发环境也可在 web/.env.development 中设置 PUBLIC_API_BASE=http://127.0.0.1:8000 直连 API。`,
      );
    });
  }, [bootstrap]);

  useEffect(() => {
    return () => {
      stopTrainPolling();
      stopInferPolling();
    };
  }, [stopTrainPolling, stopInferPolling]);

  const visibleIds = useMemo(
    () => currentImageItems.map((x) => x.id),
    [currentImageItems],
  );
  const checkedCount = useMemo(
    () => visibleIds.filter((id) => selectedImageIds.has(id)).length,
    [visibleIds, selectedImageIds],
  );
  const headerChecked =
    visibleIds.length > 0 && checkedCount === visibleIds.length;

  const focusMeta = useMemo(() => {
    const total = currentImageItems.length;
    const cur = total === 0 || focusedRowIndex < 0 ? 0 : focusedRowIndex + 1;
    return `当前 ${cur}/${total}`;
  }, [currentImageItems.length, focusedRowIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName || '';
      const inTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (event.target as HTMLElement)?.isContentEditable;
      if (inTyping) return;

      if (event.key === '1') {
        event.preventDefault();
        if (previewOpen) void previewLabelCurrent('target_plant');
        else if (quickMode) void quickLabelCurrent('target_plant');
        else void batchSaveLabel('target_plant', true);
      } else if (event.key === '2') {
        event.preventDefault();
        if (previewOpen) void previewLabelCurrent('other');
        else if (quickMode) void quickLabelCurrent('other');
        else void batchSaveLabel('other', true);
      } else if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        void undoLabels(1);
      } else if (event.key === 'Escape') {
        if (!previewOpen) return;
        event.preventDefault();
        closePreview();
      } else if (
        event.key === 'a' ||
        event.key === 'A' ||
        event.key === 'ArrowLeft'
      ) {
        if (!previewOpen) return;
        event.preventDefault();
        navigatePreview(-1);
      } else if (
        event.key === 'd' ||
        event.key === 'D' ||
        event.key === 'ArrowRight'
      ) {
        if (!previewOpen) return;
        event.preventDefault();
        navigatePreview(1);
      } else if (event.key === ',') {
        if (!previewOpen) return;
        event.preventDefault();
        navigatePreviewUnreviewed(-1);
      } else if (event.key === '.') {
        if (!previewOpen) return;
        event.preventDefault();
        navigatePreviewUnreviewed(1);
      } else if (event.key === '+' || event.key === '=') {
        if (!previewOpen) return;
        event.preventDefault();
        zoomPreview(1.2);
      } else if (event.key === '-' || event.key === '_') {
        if (!previewOpen) return;
        event.preventDefault();
        zoomPreview(1 / 1.2);
      } else if (event.key === 'r' || event.key === 'R') {
        if (!previewOpen) return;
        event.preventDefault();
        void previewReviewCurrent();
      } else if (event.key === 'u' || event.key === 'U') {
        if (!previewOpen) return;
        event.preventDefault();
        setPreviewOnlyUnreviewed((v) => !v);
        setPreviewIndex((i) => (i < 0 ? 0 : i));
      } else if (event.key === 'ArrowUp') {
        if (previewOpen || !quickMode) return;
        event.preventDefault();
        moveFocus(-1);
      } else if (event.key === 'ArrowDown') {
        if (previewOpen || !quickMode) return;
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === '[') {
        event.preventDefault();
        void gotoPage(-1);
      } else if (event.key === ']') {
        event.preventDefault();
        void gotoPage(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    previewOpen,
    quickMode,
    previewLabelCurrent,
    quickLabelCurrent,
    batchSaveLabel,
    undoLabels,
    closePreview,
    navigatePreview,
    navigatePreviewUnreviewed,
    zoomPreview,
    previewReviewCurrent,
    moveFocus,
    gotoPage,
  ]);

  const onHeaderCheckChange = useCallback(
    async (checked: boolean) => {
      const next = new Set(selectedImageIds);
      for (const item of currentImageItems) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      setSelectedImageIds(next);
      await refreshImages();
    },
    [selectedImageIds, currentImageItems, refreshImages],
  );

  const clearSelection = useCallback(async () => {
    setSelectedImageIds(new Set());
    await refreshImages();
  }, [refreshImages]);

  return {
    stats,
    importMsg,
    keyword,
    setKeyword,
    filterStatus,
    setFilterStatus,
    filterLabel,
    setFilterLabel,
    filterReviewed,
    setFilterReviewed,
    page,
    setPage,
    pageSize,
    setPageSize,
    randomCount,
    setRandomCount,
    quickMode,
    setQuickMode,
    currentImageItems,
    selectedImageIds,
    selectedImageInfo,
    toggleItemSelection,
    setSelectedImageIds,
    focusedRowIndex,
    setFocusedRowIndex,
    pageMeta,
    serverPage,
    totalPages,
    refreshImages,
    randomUnlabeled,
    saveLabel,
    batchSaveLabel,
    undoLabels,
    undoSteps,
    setUndoSteps,
    gotoPage,
    goToAbsolutePage,
    totalImageCount,
    refreshStats,
    opLogLimit,
    setOpLogLimit,
    opLogs,
    refreshLabelOperations,
    trainMode,
    setTrainMode,
    baseVersion,
    setBaseVersion,
    trainJobId,
    setTrainJobId,
    trainMsg,
    setTrainMsg,
    trainStatusText,
    setTrainStatusText,
    queryTrainStatus,
    startTrainPolling,
    stopTrainPolling,
    inferModelVersion,
    setInferModelVersion,
    inferInputDir,
    setInferInputDir,
    inferJobId,
    setInferJobId,
    inferMsg,
    setInferMsg,
    inferStatusText,
    setInferStatusText,
    queryInferStatus,
    startInferPolling,
    stopInferPolling,
    reviewJobId,
    setReviewJobId,
    reviewPredClass,
    setReviewPredClass,
    reviewSortOrder,
    setReviewSortOrder,
    reviewLimit,
    setReviewLimit,
    reviewMeta,
    inferReviewItems,
    loadInferReviewResults,
    fixReviewLabel,
    models,
    refreshModels,
    publishModel,
    filesInputRef,
    folderInputRef,
    pickFiles,
    pickFolder,
    onFilesChange,
    loadingKey,
    headerChecked,
    onHeaderCheckChange,
    clearSelection,
    focusMeta,
    moveFocus,
    openPreviewByIndex,
    closePreview,
    previewOpen,
    previewIndex,
    previewScale,
    setPreviewScale,
    previewOffset,
    setPreviewOffset,
    previewDragging,
    zoomPreview,
    resetPreviewTransform,
    navigatePreview,
    navigatePreviewUnreviewed,
    previewLabelCurrent,
    previewReviewCurrent,
    previewOnlyUnreviewed,
    setPreviewOnlyUnreviewed,
    getUnreviewedRemainCount,
    onPreviewMouseDown,
    onlyUnlabeled: async () => {
      setFilterStatus('imported');
      setPage('1');
      saveFilterState();
      const q = new URLSearchParams();
      q.set('page', '1');
      q.set('page_size', String(Number(pageSize || 20)));
      q.set('status', 'imported');
      const kw = keyword.trim();
      if (kw) q.set('keyword', kw);
      if (filterLabel) q.set('label', filterLabel);
      if (filterReviewed) q.set('reviewed', filterReviewed);
      const data = await api<{
        items: ImageItem[];
        page: number;
        total_pages: number;
        total: number;
      }>(`/api/images?${q.toString()}`);
      const items = data.items || [];
      setCurrentImageItems(items);
      syncInfoFromItems(items);
      setServerPage(data.page || 1);
      setTotalPages(data.total_pages || 0);
      setTotalImageCount(data.total ?? 0);
      setPageMeta(
        `共 ${data.total} 条，第 ${data.page}/${Math.max(1, data.total_pages)} 页`,
      );
      setFocusedRowIndex((prev) => normalizeFocusIndex(items, prev));
    },
  };
}

export type PlantConsoleApi = ReturnType<typeof usePlantConsole>;
