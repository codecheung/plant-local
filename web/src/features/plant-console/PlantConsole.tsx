import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, apiUrl } from '@/api/client';
import type { ImageItem, InferReviewItem, LabelOp, ModelRow } from './types';
import { LabelStatusTag } from './LabelStatusTag';
import { PreviewDrawer } from './PreviewDrawer';
import { usePlantConsole } from './usePlantConsole';
import { isTerminalStatus } from './utils';

const { Text, Title } = Typography;

const mono: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

const pageWrap: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--semi-color-bg-0)',
  color: 'var(--semi-color-text-0)',
};

const container: CSSProperties = {
  maxWidth: 1150,
  margin: '0 auto',
  padding: '20px 16px 48px',
};

const tableScroll: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  overflowX: 'auto',
  maxWidth: '100%',
  border: '1px solid var(--semi-color-border)',
  borderRadius: 'var(--semi-border-radius-medium)',
};

/** 图片列表 / 识别复核：表格随卡片宽度伸缩，不出现横向滚动条 */
const labelTablesWrap: CSSProperties = {
  ...tableScroll,
  overflowX: 'hidden',
};

/** 两列卡片同高：grid 行高取较高一列，子项 height:100% 铺满 */
const twoColEqualHeightGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
  gap: 16,
  alignItems: 'stretch',
};

const nestedCardFill: CSSProperties = {
  height: '100%',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const nestedCardBodyFill: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

/** 「文件」列：长文件名/路径在列宽内自动折行（不省略） */
const fileColumnCellStyle: CSSProperties = {
  verticalAlign: 'top',
  minWidth: 0,
};

const fileColumnWrapBox: CSSProperties = {
  minWidth: 0,
  maxWidth: '100%',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};

const fileColumnLineStyle: CSSProperties = {
  display: 'block',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  maxWidth: '100%',
};

const FILTER_STATUS_ITEMS = [
  { label: '全部状态', value: '' },
  { label: '未标注', value: 'imported' },
  { label: '已标注', value: 'labeled' },
] as const;

const FILTER_LABEL_ITEMS = [
  { label: '全部标签', value: '' },
  { label: '目标植物', value: 'target_plant' },
  { label: '其他', value: 'other' },
] as const;

const FILTER_REVIEWED_ITEMS = [
  { label: '全部复核状态', value: '' },
  { label: '已复核', value: 'true' },
  { label: '未复核', value: 'false' },
] as const;

const TRAIN_MODE_ITEMS = [
  { label: '新训练', value: 'new' },
  { label: '继续训练', value: 'continue' },
] as const;

/** 「图片列表与快速标注」与「识别结果复核」共用列宽，保证两表对齐一致 */
const TABLE_COL = {
  select: 40,
  id: 60,
  preview: 112,
  /** 与「当前标签」列同宽，便于预测/标签列视觉对齐 */
  predict: 90,
  confidence: 80,
  tag: 100,
  review: 60,
  /**
   * 操作列固定宽度；按钮 `width:100%` 竖排。
   * 「文件」列不设 width，在 table-layout:fixed 下占满剩余宽度。
   */
  action: 152,
} as const;

const opColStack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: '100%',
  alignItems: 'stretch',
  boxSizing: 'border-box',
};

const opColBtn: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: 1.35,
  paddingLeft: 6,
  paddingRight: 6,
};

const REVIEW_PRED_ITEMS = [
  { label: '全部预测类别', value: '' },
  { label: '目标植物', value: 'target_plant' },
  { label: '其他', value: 'other' },
] as const;

const REVIEW_SORT_ITEMS = [
  { label: '置信度从低到高', value: 'asc' },
  { label: '置信度从高到低', value: 'desc' },
] as const;

/** 标注统计小卡片左侧强调色（与标签语义一致） */
const STAT_CARD_ACCENT: Record<string, string> = {
  总图片: 'var(--semi-color-primary)',
  已标注: 'var(--semi-color-success)',
  未标注: 'var(--semi-color-text-2)',
  目标植物: 'var(--semi-color-success)',
  其他: 'var(--semi-color-warning)',
  已复核: 'var(--semi-color-link)',
};

/** 任务编号 string state ↔ InputNumber（空串表示未填） */
function jobIdInputNumberValue(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

function formatDateTimeCell(v: unknown): string {
  if (v == null || v === '') return '-';
  const d = dayjs(v as string | number | Date);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(v);
}

function formatAccCell(metrics: unknown): string {
  if (!metrics || typeof metrics !== 'object') return '-';
  const accRaw = (metrics as { acc?: unknown }).acc;
  const accNum =
    typeof accRaw === 'number'
      ? accRaw
      : typeof accRaw === 'string'
        ? Number(accRaw)
        : Number.NaN;
  if (!Number.isFinite(accNum)) return '-';
  return `${(accNum * 100).toFixed(1)}%`;
}

function extractJobStatus(text: string): string {
  if (!text.trim()) return '';
  try {
    const obj = JSON.parse(text) as { status?: string };
    return String(obj?.status ?? '');
  } catch {
    return '';
  }
}

function statusPillStyle(status: string): CSSProperties {
  const isSuccess = status === 'success';
  const isFailed = status === 'failed';
  const isRunning = status === 'queued' || status === 'running';
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--semi-color-border)',
    background: isSuccess
      ? 'var(--semi-color-success-light-default)'
      : isFailed
        ? 'var(--semi-color-danger-light-default)'
        : isRunning
          ? 'var(--semi-color-primary-light-default)'
          : 'var(--semi-color-fill-0)',
    color: isSuccess
      ? 'var(--semi-color-success)'
      : isFailed
        ? 'var(--semi-color-danger)'
        : isRunning
          ? 'var(--semi-color-primary)'
          : 'var(--semi-color-text-1)',
  };
}

export type ConsolePage = 'data-label' | 'train-infer' | 'models';

/** 从「模型版本」页跳转时携带，在「训练与识别」首屏写入表单（各路由独立挂载，不能直接共用 hook 状态） */
type TrainInferLocationState = {
  fromModelsContinueTrain?: boolean;
  trainBaseVersion?: string;
  fromModelsInfer?: boolean;
  inferModelVersion?: string;
};

export function PlantConsole({ page }: { page: ConsolePage }) {
  const pc = usePlantConsole();
  const navigate = useNavigate();
  const location = useLocation();

  /** 模型页「用于继续训练 / 用于识别」经路由 state 带到本页后应用一次 */
  useEffect(() => {
    if (page !== 'train-infer') return;
    const st = location.state as TrainInferLocationState | null | undefined;
    if (!st || typeof st !== 'object') return;
    let applied = false;
    if (st.fromModelsContinueTrain && st.trainBaseVersion) {
      pc.setTrainMode('continue');
      pc.setTrainBaseVersion(st.trainBaseVersion);
      applied = true;
    }
    if (st.fromModelsInfer && st.inferModelVersion) {
      pc.setInferModelVersion(st.inferModelVersion);
      applied = true;
    }
    if (applied) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [
    page,
    location.pathname,
    location.state,
    navigate,
    pc.setTrainMode,
    pc.setTrainBaseVersion,
    pc.setInferModelVersion,
  ]);

  const isDataLabelPage = page === 'data-label';
  const isTrainInferPage = page === 'train-infer';
  const isModelsPage = page === 'models';

  const previewItem =
    pc.previewOpen && pc.currentImageItems.length
      ? pc.currentImageItems[pc.previewIndex]
      : null;
  const previewInfo = previewItem
    ? (pc.selectedImageInfo.get(previewItem.id) ?? {
        label: previewItem.label,
        reviewed: previewItem.reviewed,
      })
    : null;

  const [metricsModal, setMetricsModal] = useState<{
    version: string;
    metrics: unknown;
  } | null>(null);
  const [recentTrainJobs, setRecentTrainJobs] = useState<number[]>([]);
  const [recentInferJobs, setRecentInferJobs] = useState<number[]>([]);
  const [modelFilter, setModelFilter] = useState<
    'all' | 'published' | 'unpublished'
  >('all');
  const labelCardRef = useRef<HTMLDivElement | null>(null);
  const focusScrollTimerRef = useRef<number | null>(null);
  const trainJobStatus = extractJobStatus(pc.trainStatusText);
  const inferJobStatus = extractJobStatus(pc.inferStatusText);
  const activeTrainJobId = Number(pc.trainJobId || 0);
  const activeInferJobId = Number(pc.inferJobId || 0);
  const filteredModels = pc.models.filter((m) => {
    if (modelFilter === 'published') return !!m.is_published;
    if (modelFilter === 'unpublished') return !m.is_published;
    return true;
  });
  const sortedModels = [
    ...filteredModels.filter((m) => m.is_published),
    ...filteredModels.filter((m) => !m.is_published),
  ];

  const rememberRecentJob = (
    setFn: Dispatch<SetStateAction<number[]>>,
    id: number,
  ) => {
    if (!Number.isFinite(id) || id <= 0) return;
    setFn((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 6));
  };

  const scrollToLabelCardTop = () => {
    const el = labelCardRef.current;
    if (!el) return;
    const navOffset = 60;
    const extraGap = 10;
    const top =
      window.scrollY + el.getBoundingClientRect().top - navOffset - extraGap;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  useEffect(() => {
    if (!pc.quickMode || pc.previewOpen) return;
    if (pc.focusedRowIndex < 0) return;
    const id = window.requestAnimationFrame(() => {
      if (focusScrollTimerRef.current != null) {
        window.clearTimeout(focusScrollTimerRef.current);
      }
      const row = document.querySelector(
        '.plant-focused-row',
      ) as HTMLElement | null;
      if (!row) return;
      const navOffset = 60;
      const topOffset = 28;
      const bottomOffset = 54;
      const rowRect = row.getBoundingClientRect();
      const topBoundary = navOffset + topOffset;
      const viewportBottom = window.innerHeight - bottomOffset;
      const currentY = window.scrollY;
      let targetY = currentY;
      if (rowRect.top < topBoundary) {
        targetY = currentY + (rowRect.top - topBoundary);
      } else if (rowRect.bottom > viewportBottom) {
        targetY = currentY + (rowRect.bottom - viewportBottom);
      }
      if (Math.abs(targetY - currentY) > 1) {
        focusScrollTimerRef.current = window.setTimeout(() => {
          window.scrollTo({
            top: Math.max(0, targetY),
            behavior: 'smooth',
          });
          focusScrollTimerRef.current = null;
        }, 48);
      }
    });
    return () => {
      window.cancelAnimationFrame(id);
      if (focusScrollTimerRef.current != null) {
        window.clearTimeout(focusScrollTimerRef.current);
        focusScrollTimerRef.current = null;
      }
    };
  }, [
    pc.quickMode,
    pc.previewOpen,
    pc.focusedRowIndex,
    pc.currentImageItems.length,
  ]);

  const imageColumns: ColumnProps<ImageItem>[] = [
    {
      title: (
        <Checkbox
          checked={pc.headerChecked}
          onChange={(e) =>
            void pc.onHeaderCheckChange(e.target.checked ?? false)
          }
        />
      ),
      width: TABLE_COL.select,
      render: (_t, r) => (
        <Checkbox
          checked={pc.selectedImageIds.has(r.id)}
          onChange={(e) => {
            pc.toggleItemSelection(r.id, e.target.checked ?? false);
          }}
        />
      ),
    },
    {
      title: '编号',
      dataIndex: 'id',
      width: TABLE_COL.id,
      align: 'center',
    },
    {
      title: '预览',
      width: TABLE_COL.preview,
      align: 'center',
      render: (_t, r, idx) => (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img
            src={`/api/images/${r.id}/preview`}
            alt={r.filename}
            style={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid var(--semi-color-border)',
              cursor: 'pointer',
            }}
            loading="lazy"
            onClick={() => pc.openPreviewByIndex(idx ?? 0)}
          />
        </div>
      ),
    },
    {
      title: '文件',
      /** 不设置 width：其余列固定后，本列占满剩余宽度 */
      onCell: () => ({ style: fileColumnCellStyle }),
      render: (_t, r, idx) => (
        <div style={fileColumnWrapBox}>
          <span
            role="button"
            tabIndex={0}
            onClick={() => pc.openPreviewByIndex(idx ?? 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pc.openPreviewByIndex(idx ?? 0);
              }
            }}
            style={{
              ...fileColumnLineStyle,
              color: 'var(--semi-color-link)',
              cursor: 'pointer',
            }}
            title={r.filename}
          >
            {r.filename}
          </span>
          <Text
            type="tertiary"
            style={{
              ...mono,
              ...fileColumnLineStyle,
            }}
            title={r.storage_path}
          >
            {r.storage_path}
          </Text>
        </div>
      ),
    },
    {
      title: '当前标签',
      width: TABLE_COL.tag,
      align: 'center',
      render: (_t, r) => <LabelStatusTag label={r.label} />,
    },
    {
      title: '复核',
      width: TABLE_COL.review,
      align: 'center',
      render: (_t, r) => (r.reviewed ? '是' : '否'),
    },
    {
      title: '操作',
      width: TABLE_COL.action,
      align: 'center',
      render: (_t, r) => (
        <div style={opColStack}>
          <Button
            style={opColBtn}
            theme="solid"
            onClick={() => void pc.saveLabel(r.id, 'target_plant')}
          >
            标为目标植物
          </Button>
          <Button
            style={opColBtn}
            type="warning"
            onClick={() => void pc.saveLabel(r.id, 'other')}
          >
            标为其他
          </Button>
          <Button
            style={opColBtn}
            theme="outline"
            onClick={() => void pc.saveLabel(r.id, r.label || 'other', true)}
          >
            仅设复核
          </Button>
        </div>
      ),
    },
  ];

  const opColumns: ColumnProps<LabelOp>[] = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => formatDateTimeCell(v),
    },
    {
      title: '操作批次编号',
      dataIndex: 'operation_id',
      /** 不设 width：占满除固定列外的剩余宽度 */
      onCell: () => ({ style: fileColumnCellStyle }),
      render: (_t, r) => (
        <span
          style={{
            ...mono,
            ...fileColumnLineStyle,
          }}
          title={String(r.operation_id ?? '')}
        >
          {String(r.operation_id ?? '-')}
        </span>
      ),
    },
    {
      title: '变更条数',
      dataIndex: 'changed_items',
      width: 88,
      align: 'center',
    },
    {
      title: '新标注',
      dataIndex: 'newly_labeled_items',
      width: 88,
      align: 'center',
    },
    {
      title: '重标注',
      dataIndex: 'relabeled_items',
      width: 88,
      align: 'center',
    },
    {
      title: '操作',
      width: TABLE_COL.action,
      align: 'center',
      render: (_t, _r, i) => (
        <Button
          size="small"
          style={{
            ...opColBtn,
            width: '100%',
            maxWidth: '100%',
          }}
          onClick={() => void pc.undoLabels((i ?? 0) + 1)}
        >
          撤销到此
        </Button>
      ),
    },
  ];

  const reviewColumns: ColumnProps<InferReviewItem>[] = [
    {
      title: '预览',
      width: TABLE_COL.preview,
      align: 'center',
      render: (_t, x) =>
        x.image_id ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img
              src={apiUrl(`/api/images/${x.image_id}/preview`)}
              alt={x.filename}
              style={{
                width: 96,
                height: 96,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid var(--semi-color-border)',
              }}
              loading="lazy"
            />
          </div>
        ) : (
          <Text type="tertiary">无预览</Text>
        ),
    },
    {
      title: '文件',
      /** 不设置 width：其余列固定后，本列占满剩余宽度 */
      onCell: () => ({ style: fileColumnCellStyle }),
      render: (_t, x) => (
        <div style={fileColumnWrapBox}>
          <Text style={{ ...fileColumnLineStyle }} title={x.filename}>
            {x.filename ?? '-'}
          </Text>
          <Text
            type="tertiary"
            style={{
              ...mono,
              ...fileColumnLineStyle,
            }}
            title={x.path}
          >
            {x.path ?? '-'}
          </Text>
        </div>
      ),
    },
    {
      title: '预测类别',
      width: TABLE_COL.predict,
      align: 'center',
      render: (_t, x) => <LabelStatusTag label={x.predicted_class} />,
    },
    {
      title: '置信度',
      width: TABLE_COL.confidence,
      align: 'center',
      dataIndex: 'confidence',
      render: (v) => v ?? '-',
    },
    {
      title: '当前标签',
      width: TABLE_COL.tag,
      align: 'center',
      render: (_t, x) => <LabelStatusTag label={x.current_label} />,
    },
    {
      title: '复核',
      width: TABLE_COL.review,
      align: 'center',
      render: (_t, x) => (x.reviewed ? '是' : '否'),
    },
    {
      title: '纠正操作',
      width: TABLE_COL.action,
      align: 'center',
      render: (_t, x) =>
        x.image_id ? (
          <div style={opColStack}>
            <Button
              className="plant-console-btn-target-plant"
              style={opColBtn}
              theme="solid"
              onClick={() =>
                void pc.fixReviewLabel(x.image_id!, 'target_plant')
              }
            >
              改为目标植物
            </Button>
            <Button
              style={opColBtn}
              type="warning"
              theme="solid"
              onClick={() => void pc.fixReviewLabel(x.image_id!, 'other')}
            >
              改为其他
            </Button>
            <Button
              style={opColBtn}
              theme="outline"
              onClick={() =>
                void pc.fixReviewLabel(x.image_id!, x.current_label || 'other')
              }
            >
              仅复核
            </Button>
          </div>
        ) : (
          <Text type="tertiary">无法关联原图</Text>
        ),
    },
  ];

  const modelColumns: ColumnProps<ModelRow>[] = [
    {
      title: '版本',
      dataIndex: 'version',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (v) => formatDateTimeCell(v),
    },
    {
      title: '准确率',
      width: 96,
      align: 'center',
      render: (_t, m) => formatAccCell(m.metrics),
    },
    {
      title: '指标',
      width: 88,
      align: 'center',
      render: (_t, m) =>
        m.metrics != null ? (
          <Button
            size="small"
            theme="borderless"
            type="primary"
            onClick={() =>
              setMetricsModal({ version: m.version, metrics: m.metrics })
            }
          >
            查看
          </Button>
        ) : (
          <Text type="tertiary">-</Text>
        ),
    },
    {
      title: '发布状态',
      width: 100,
      align: 'center',
      render: (_t, m) => (m.is_published ? '已发布' : '未发布'),
    },
    {
      title: '操作',
      width: 335,
      render: (_t, m) => (
        <Space wrap spacing="tight">
          <Button size="small" onClick={() => void pc.publishModel(m.version)}>
            发布该版本
          </Button>
          <Button
            size="small"
            theme="outline"
            onClick={() => {
              navigate('/train-infer', {
                state: {
                  fromModelsContinueTrain: true,
                  trainBaseVersion: m.version,
                },
              });
            }}
          >
            用于继续训练
          </Button>
          <Button
            size="small"
            theme="outline"
            onClick={() => {
              navigate('/train-infer', {
                state: {
                  fromModelsInfer: true,
                  inferModelVersion: m.version,
                },
              });
            }}
          >
            用于识别
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={pageWrap}>
      <div style={container}>
        <Card
          bordered
          bodyStyle={{ padding: '10px 14px' }}
          style={{ width: '100%', marginBottom: 16 }}
        >
          <Text type="tertiary">
            {isDataLabelPage
              ? '数据与标注：先导入并完成标注/复核，再进入训练。'
              : isTrainInferPage
                ? '训练与识别：配置任务并查看当前状态，任务成功后可在复核区闭环。'
                : '模型版本：查看指标、发布版本，或一键把版本带入继续训练/识别。'}
          </Text>
        </Card>

        <Space
          vertical
          align="start"
          spacing="loose"
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
          }}
        >
          {isTrainInferPage ? (
            <Card title="当前活跃任务" bordered style={{ width: '100%' }}>
              <Row gutter={[12, 12]}>
                <Col xs={24} md={12}>
                  <Card
                    bordered
                    bodyStyle={{ padding: 12 }}
                    style={{ background: 'var(--semi-color-fill-0)' }}
                  >
                    <Space vertical align="start" style={{ width: '100%' }}>
                      <Text type="tertiary">训练任务</Text>
                      <Text>
                        任务编号：
                        {activeTrainJobId > 0 ? activeTrainJobId : '-'}
                      </Text>
                      <Text>状态：{trainJobStatus || '-'}</Text>
                      {activeTrainJobId > 0 ? (
                        <Button
                          size="default"
                          theme="outline"
                          onClick={async () => {
                            const data =
                              await pc.queryTrainStatus(activeTrainJobId);
                            rememberRecentJob(
                              setRecentTrainJobs,
                              activeTrainJobId,
                            );
                            if (!isTerminalStatus(data.status)) {
                              pc.startTrainPolling(activeTrainJobId);
                            }
                          }}
                        >
                          刷新状态
                        </Button>
                      ) : null}
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card
                    bordered
                    bodyStyle={{ padding: 12 }}
                    style={{ background: 'var(--semi-color-fill-0)' }}
                  >
                    <Space vertical align="start" style={{ width: '100%' }}>
                      <Text type="tertiary">识别任务</Text>
                      <Text>
                        任务编号：
                        {activeInferJobId > 0 ? activeInferJobId : '-'}
                      </Text>
                      <Text>状态：{inferJobStatus || '-'}</Text>
                      {activeInferJobId > 0 ? (
                        <Button
                          size="default"
                          theme="outline"
                          onClick={async () => {
                            const data =
                              await pc.queryInferStatus(activeInferJobId);
                            rememberRecentJob(
                              setRecentInferJobs,
                              activeInferJobId,
                            );
                            if (!isTerminalStatus(data.status)) {
                              pc.startInferPolling(activeInferJobId);
                            }
                          }}
                        >
                          刷新状态
                        </Button>
                      ) : null}
                    </Space>
                  </Card>
                </Col>
              </Row>
            </Card>
          ) : null}

          {isDataLabelPage ? (
            <Card title="数据导入" bordered style={{ width: '100%' }}>
              <input
                ref={pc.filesInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                multiple
                hidden
                onChange={pc.onFilesChange}
              />
              <input
                ref={pc.folderInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                multiple
                hidden
                {...{ webkitdirectory: '', directory: '' }}
                onChange={pc.onFilesChange}
              />
              <Space wrap>
                <Button
                  type="primary"
                  loading={pc.loadingKey === 'upload-files'}
                  onClick={pc.pickFiles}
                >
                  选择图片文件并上传
                </Button>
                <Button
                  type="primary"
                  loading={pc.loadingKey === 'upload-folder'}
                  onClick={pc.pickFolder}
                >
                  选择图片文件夹并上传
                </Button>
                <Text type="secondary">图片会上传到系统目录并自动入库</Text>
              </Space>
              {pc.importMsg && (
                <Text
                  style={{
                    marginTop: 8,
                    color: pc.importMsg.ok
                      ? 'var(--semi-color-success)'
                      : 'var(--semi-color-danger)',
                  }}
                >
                  {pc.importMsg.text}
                </Text>
              )}
            </Card>
          ) : null}

          {isDataLabelPage ? (
            <Card
              title="标注统计"
              bordered
              bodyStyle={{ paddingBottom: 20 }}
              style={{ width: '100%' }}
            >
              <Row gutter={[16, 16]}>
                {pc.stats &&
                  (
                    [
                      ['总图片', pc.stats.total_images],
                      ['已标注', pc.stats.labeled],
                      ['未标注', pc.stats.unlabeled],
                      ['目标植物', pc.stats.target_plant],
                      ['其他', pc.stats.other],
                      ['已复核', pc.stats.reviewed],
                    ] as const
                  ).map(([k, v]) => (
                    <Col key={k} xs={12} sm={8} md={6} lg={4} xl={4}>
                      <Card
                        bordered={false}
                        shadows="hover"
                        bodyStyle={{ padding: '14px 16px 16px' }}
                        style={{
                          height: '100%',
                          borderRadius: 'var(--semi-border-radius-medium)',
                          background: 'var(--semi-color-fill-0)',
                          border: '1px solid var(--semi-color-border)',
                          borderLeftWidth: 3,
                          borderLeftStyle: 'solid',
                          borderLeftColor:
                            STAT_CARD_ACCENT[k] ?? 'var(--semi-color-border)',
                          transition:
                            'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                      >
                        <Text
                          type="tertiary"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {k}
                        </Text>
                        <Title
                          heading={3}
                          style={{
                            margin: '8px 0 0',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            color: 'var(--semi-color-text-0)',
                            lineHeight: '1.2',
                          }}
                        >
                          {v}
                        </Title>
                      </Card>
                    </Col>
                  ))}
              </Row>
            </Card>
          ) : null}

          {isDataLabelPage ? (
            <div ref={labelCardRef}>
              <Card
                title="图片列表与快速标注"
                bordered
                style={{ width: '100%' }}
              >
                <Space
                  vertical
                  align="start"
                  spacing={14}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                  }}
                >
                  <Space wrap spacing={10} style={{ margin: 0 }}>
                    <Input
                      placeholder="关键词（文件名/路径）"
                      value={pc.keyword}
                      onChange={(v) => pc.setKeyword(v)}
                      style={{ maxWidth: 220 }}
                    />
                    <Select
                      style={{ width: 140 }}
                      optionList={[...FILTER_STATUS_ITEMS]}
                      value={pc.filterStatus}
                      onChange={(v) => pc.setFilterStatus(String(v ?? ''))}
                    />
                    <Select
                      style={{ width: 140 }}
                      optionList={[...FILTER_LABEL_ITEMS]}
                      value={pc.filterLabel}
                      onChange={(v) => pc.setFilterLabel(String(v ?? ''))}
                    />
                    <Select
                      style={{ width: 140 }}
                      optionList={[...FILTER_REVIEWED_ITEMS]}
                      value={pc.filterReviewed}
                      onChange={(v) => pc.setFilterReviewed(String(v ?? ''))}
                    />
                    <Button
                      type="primary"
                      onClick={() => void pc.refreshImages()}
                    >
                      查询
                    </Button>
                    <Button
                      theme="outline"
                      onClick={() => void pc.onlyUnlabeled()}
                    >
                      仅看未标注
                    </Button>
                    <InputNumber
                      innerButtons
                      min={1}
                      max={200}
                      value={Number(pc.randomCount) || 20}
                      onChange={(v) => pc.setRandomCount(String(v ?? 20))}
                      style={{ width: 90 }}
                    />
                    <Button
                      theme="outline"
                      onClick={() => void pc.randomUnlabeled()}
                    >
                      随机抽样待标注
                    </Button>
                  </Space>
                  <div
                    className="quick-mode-row"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      columnGap: 8,
                      rowGap: 0,
                      marginTop: 0,
                      marginBottom: 0,
                      lineHeight: 1,
                    }}
                  >
                    <Tooltip
                      content={
                        <div style={{ maxWidth: 320 }}>
                          <div>
                            <strong>开启后</strong>：按键盘{' '}
                            <code style={{ fontSize: 12 }}>1</code> /{' '}
                            <code style={{ fontSize: 12 }}>2</code> 会直接标注
                            <strong>当前高亮行</strong>
                            （表格左侧蓝底那一行），保存后自动移到下一行；可用{' '}
                            <code style={{ fontSize: 12 }}>↑</code> /{' '}
                            <code style={{ fontSize: 12 }}>↓</code> 或「上一条 /
                            下一条」切换高亮。
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <strong>关闭时</strong>：须先勾选行前的复选框，再按{' '}
                            <code style={{ fontSize: 12 }}>1</code> /{' '}
                            <code style={{ fontSize: 12 }}>2</code> 对
                            <strong>已勾选的多行</strong>批量标注。
                          </div>
                        </div>
                      }
                    >
                      <Checkbox
                        checked={pc.quickMode}
                        onChange={(e) =>
                          pc.setQuickMode(e.target.checked ?? false)
                        }
                        style={{ margin: 0, lineHeight: 1 }}
                      >
                        <Text>连续标注模式</Text>
                      </Checkbox>
                    </Tooltip>
                    <Text
                      type="tertiary"
                      style={{
                        lineHeight: '16px',
                        margin: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      {pc.quickMode
                        ? '连续模式：`1`/`2` 标当前高亮行并自动下一行；`↑`/`↓` 换行；`z` 撤销'
                        : '普通模式：先勾选行再 `1`/`2` 批量标注；`↑`/`↓` 需开启连续模式'}
                    </Text>
                  </div>

                  <Space wrap spacing={10} style={{ margin: 0 }}>
                    <Button
                      theme="light"
                      onClick={() => void pc.clearSelection()}
                    >
                      清空选择
                    </Button>
                    <Button
                      className="plant-console-btn-target-plant"
                      theme="solid"
                      onClick={() =>
                        void pc.batchSaveLabel('target_plant', true)
                      }
                    >
                      批量标为目标植物
                    </Button>
                    <Button
                      type="warning"
                      theme="solid"
                      onClick={() => void pc.batchSaveLabel('other', true)}
                    >
                      批量标为其他
                    </Button>
                    <Button onClick={() => void pc.batchSaveLabel(null, true)}>
                      批量设为已复核
                    </Button>
                    <Text type="tertiary">
                      已选 {pc.selectedImageIds.size} 条
                    </Text>
                    <InputNumber
                      innerButtons
                      suffix="步"
                      min={1}
                      max={20}
                      value={Number(pc.undoSteps) || 1}
                      onChange={(v) => pc.setUndoSteps(String(v ?? 1))}
                      style={{ width: 100 }}
                    />
                    <Button
                      type="danger"
                      onClick={() => void pc.undoLabels(Number(pc.undoSteps))}
                    >
                      撤销最近标注
                    </Button>
                    {pc.quickMode ? (
                      <>
                        <Button theme="light" onClick={() => pc.moveFocus(-1)}>
                          上一条
                        </Button>
                        <Button theme="light" onClick={() => pc.moveFocus(1)}>
                          下一条
                        </Button>
                        <Text type="tertiary">{pc.focusMeta}</Text>
                      </>
                    ) : null}
                  </Space>

                  <div
                    className="plant-table-scroll-wrap"
                    style={labelTablesWrap}
                  >
                    <Table<ImageItem>
                      columns={imageColumns}
                      dataSource={pc.currentImageItems}
                      rowKey="id"
                      pagination={false}
                      empty={<Text type="tertiary">暂无数据</Text>}
                      style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        tableLayout: 'fixed',
                      }}
                      onRow={(_record, index) => ({
                        className:
                          pc.quickMode && index === pc.focusedRowIndex
                            ? 'plant-focused-row'
                            : '',
                        style: {
                          scrollMarginTop: 96,
                          scrollMarginBottom: 66,
                          background:
                            pc.quickMode && index === pc.focusedRowIndex
                              ? 'var(--semi-color-primary-light-default)'
                              : undefined,
                        },
                      })}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      width: '100%',
                    }}
                  >
                    <Text
                      type="tertiary"
                      style={{ flex: '1 1 auto', minWidth: 0 }}
                    >
                      {pc.pageMeta}
                    </Text>
                    {pc.totalPages > 0 && pc.totalImageCount > 0 ? (
                      <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
                        <Pagination
                          total={pc.totalImageCount}
                          pageSize={Math.max(1, Number(pc.pageSize || 20))}
                          currentPage={pc.serverPage}
                          showSizeChanger
                          pageSizeOpts={[10, 20, 40, 50, 100, 200, 500]}
                          onChange={(currentPage, size) => {
                            scrollToLabelCardTop();
                            const prevPs = Math.max(
                              1,
                              Number(pc.pageSize || 20),
                            );
                            if (size !== prevPs) {
                              void pc.changePageSizeAndRefresh(size);
                            } else {
                              void pc.goToAbsolutePage(currentPage);
                            }
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </Space>
              </Card>
            </div>
          ) : null}

          {isDataLabelPage ? (
            <Card
              title="标注操作日志（最近批次）"
              bordered
              style={{ width: '100%' }}
            >
              <Space wrap style={{ marginBottom: 12 }}>
                <InputNumber
                  innerButtons
                  suffix="条"
                  min={1}
                  max={100}
                  value={Number(pc.opLogLimit) || 20}
                  onChange={(v) => pc.setOpLogLimit(String(v ?? 20))}
                  style={{ width: 100 }}
                />
                <Button
                  theme="outline"
                  onClick={() => void pc.refreshLabelOperations()}
                >
                  刷新日志
                </Button>
                <Text type="tertiary">
                  点击「撤销到此」会自动按批次回退到该条
                </Text>
              </Space>
              <div className="plant-table-scroll-wrap" style={labelTablesWrap}>
                <Table<LabelOp>
                  columns={opColumns}
                  dataSource={pc.opLogs}
                  rowKey="operation_id"
                  pagination={false}
                  size="small"
                  empty={<Text type="tertiary">暂无标注日志</Text>}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    tableLayout: 'fixed',
                  }}
                />
              </div>
            </Card>
          ) : null}

          {isTrainInferPage ? (
            <Card title="训练中心" bordered style={{ width: '100%' }}>
              <div style={twoColEqualHeightGrid}>
                <Card
                  title="训练配置"
                  bordered
                  style={nestedCardFill}
                  bodyStyle={nestedCardBodyFill}
                >
                  <Space
                    vertical
                    align="start"
                    style={{ width: '100%', flex: 1 }}
                  >
                    <Space wrap>
                      <Select
                        style={{ width: 140 }}
                        optionList={[...TRAIN_MODE_ITEMS]}
                        value={pc.trainMode}
                        onChange={(v) => {
                          const m = String(v ?? '');
                          pc.setTrainMode(m);
                          if (m === 'new') {
                            pc.setTrainBaseVersion('');
                          }
                        }}
                      />
                      {pc.trainMode === 'continue' ? (
                        <>
                          <Select
                            style={{ width: 180 }}
                            placeholder="选择基础模型版本"
                            optionList={pc.models.map((m) => ({
                              label: m.version,
                              value: m.version,
                            }))}
                            value={pc.trainBaseVersion}
                            onChange={(v) =>
                              pc.setTrainBaseVersion(String(v ?? ''))
                            }
                          />
                          <Button
                            theme="outline"
                            onClick={() => void pc.refreshModels()}
                          >
                            刷新模型列表
                          </Button>
                        </>
                      ) : null}
                    </Space>
                    {pc.trainMode === 'continue' ? (
                      <Text type="tertiary">
                        继续训练会在所选版本权重上微调，并产出新版本，不覆盖基础版本。
                      </Text>
                    ) : (
                      <Text type="tertiary">
                        新训练会从头训练，并产出一个新的模型版本。
                      </Text>
                    )}
                    <Button
                      type="primary"
                      onClick={async () => {
                        if (pc.trainMode === 'continue') {
                          if (!pc.trainBaseVersion.trim()) {
                            window.alert('继续训练请先选择基础模型版本');
                            return;
                          }
                          if (
                            !pc.models.some(
                              (x) => x.version === pc.trainBaseVersion,
                            )
                          ) {
                            window.alert(
                              '所选基础版本不在当前列表中，请点「刷新模型列表」后重试。',
                            );
                            await pc.refreshModels();
                            return;
                          }
                        }
                        try {
                          const data = await api<{ job_id: number }>(
                            '/api/train/start',
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                mode: pc.trainMode,
                                base_version:
                                  pc.trainMode === 'continue'
                                    ? pc.trainBaseVersion.trim()
                                    : null,
                              }),
                            },
                          );
                          pc.setTrainJobId(String(data.job_id));
                          pc.setTrainMsg({
                            ok: true,
                            text:
                              pc.trainMode === 'continue'
                                ? `训练任务已启动 job_id=${data.job_id}。成功后会新增模型版本（一般为 v${data.job_id}），在所选基础版本「${pc.trainBaseVersion.trim()}」权重上微调得到，不会覆盖该基础版本。`
                                : `训练任务已启动 job_id=${data.job_id}。成功后会新增模型版本（一般为 v${data.job_id}）。`,
                          });
                          rememberRecentJob(setRecentTrainJobs, data.job_id);
                          pc.startTrainPolling(data.job_id);
                        } catch (e) {
                          pc.setTrainMsg({
                            ok: false,
                            text: '启动训练失败: ' + (e as Error).message,
                          });
                        }
                      }}
                    >
                      启动训练
                    </Button>
                    {pc.trainMsg ? (
                      <Text
                        style={{
                          color: pc.trainMsg.ok
                            ? 'var(--semi-color-success)'
                            : 'var(--semi-color-danger)',
                        }}
                      >
                        {pc.trainMsg.text}
                      </Text>
                    ) : null}
                  </Space>
                </Card>
                <Card
                  title="训练任务状态"
                  bordered
                  style={nestedCardFill}
                  bodyStyle={nestedCardBodyFill}
                >
                  <Space
                    vertical
                    align="start"
                    style={{ width: '100%', flex: 1, minHeight: 0 }}
                  >
                    <Space wrap>
                      <InputNumber
                        innerButtons
                        placeholder="任务编号"
                        min={1}
                        showClear
                        value={jobIdInputNumberValue(pc.trainJobId)}
                        onChange={(v) =>
                          pc.setTrainJobId(
                            v == null || v === '' ? '' : String(v),
                          )
                        }
                        style={{ width: 110 }}
                      />
                      <Button
                        theme="outline"
                        onClick={async () => {
                          const id = Number(pc.trainJobId);
                          if (!id) return;
                          try {
                            const data = await pc.queryTrainStatus(id);
                            rememberRecentJob(setRecentTrainJobs, id);
                            if (!isTerminalStatus(data.status)) {
                              pc.startTrainPolling(id);
                            }
                          } catch (e) {
                            pc.setTrainStatusText(
                              '查询失败: ' + (e as Error).message,
                            );
                          }
                        }}
                      >
                        查询状态
                      </Button>
                    </Space>
                    <Space wrap>
                      <Text type="tertiary">当前状态：</Text>
                      <Text style={statusPillStyle(trainJobStatus)}>
                        {trainJobStatus || '-'}
                      </Text>
                      <Text type="tertiary">任务进行中会自动轮询</Text>
                    </Space>
                    {recentTrainJobs.length ? (
                      <Space wrap>
                        <Text type="tertiary">最近任务：</Text>
                        {recentTrainJobs.map((id) => (
                          <Button
                            key={id}
                            theme="light"
                            onClick={async () => {
                              pc.setTrainJobId(String(id));
                              try {
                                const data = await pc.queryTrainStatus(id);
                                rememberRecentJob(setRecentTrainJobs, id);
                                if (!isTerminalStatus(data.status)) {
                                  pc.startTrainPolling(id);
                                }
                              } catch (e) {
                                pc.setTrainStatusText(
                                  '查询失败: ' + (e as Error).message,
                                );
                              }
                            }}
                          >
                            #{id}
                          </Button>
                        ))}
                      </Space>
                    ) : null}
                    <pre
                      style={{
                        ...mono,
                        margin: 0,
                        width: '100%',
                        flex: 1,
                        minHeight: 120,
                        padding: '8px 10px',
                        fontSize: 11,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        overflow: 'auto',
                        borderRadius: 8,
                        background: 'var(--semi-color-fill-0)',
                        border: '1px solid var(--semi-color-border)',
                        boxSizing: 'border-box',
                      }}
                    >
                      {pc.trainStatusText || ' '}
                    </pre>
                  </Space>
                </Card>
              </div>
            </Card>
          ) : null}

          {isTrainInferPage ? (
            <Card title="识别中心" bordered style={{ width: '100%' }}>
              <div style={twoColEqualHeightGrid}>
                <Card
                  title="识别配置"
                  bordered
                  style={nestedCardFill}
                  bodyStyle={nestedCardBodyFill}
                >
                  <Space
                    vertical
                    align="start"
                    style={{ width: '100%', flex: 1 }}
                  >
                    <Select
                      style={{ width: 200 }}
                      filter
                      placeholder="模型版本（默认：已发布或最新）"
                      optionList={[
                        { label: '默认（发布中或最新）', value: '' },
                        ...pc.models.map((m) => ({
                          label: m.version,
                          value: m.version,
                        })),
                      ]}
                      value={pc.inferModelVersion}
                      onChange={(v) => pc.setInferModelVersion(String(v ?? ''))}
                    />
                    <Text type="tertiary">识别目录：data/raw</Text>
                    <Button
                      type="primary"
                      onClick={async () => {
                        try {
                          const data = await api<{ job_id: number }>(
                            '/api/infer/start',
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                model_version:
                                  pc.inferModelVersion.trim() || null,
                                input_dir: null,
                              }),
                            },
                          );
                          pc.setInferJobId(String(data.job_id));
                          pc.setReviewJobId(String(data.job_id));
                          pc.setInferMsg({
                            ok: true,
                            text: `识别任务已启动 job_id=${data.job_id}`,
                          });
                          rememberRecentJob(setRecentInferJobs, data.job_id);
                          pc.startInferPolling(data.job_id);
                        } catch (e) {
                          pc.setInferMsg({
                            ok: false,
                            text: '启动识别失败: ' + (e as Error).message,
                          });
                        }
                      }}
                    >
                      启动识别
                    </Button>
                    {pc.inferMsg ? (
                      <Text
                        style={{
                          color: pc.inferMsg.ok
                            ? 'var(--semi-color-success)'
                            : 'var(--semi-color-danger)',
                        }}
                      >
                        {pc.inferMsg.text}
                      </Text>
                    ) : null}
                  </Space>
                </Card>
                <Card
                  title="识别任务状态"
                  bordered
                  style={nestedCardFill}
                  bodyStyle={nestedCardBodyFill}
                >
                  <Space
                    vertical
                    align="start"
                    style={{ width: '100%', flex: 1, minHeight: 0 }}
                  >
                    <Space wrap>
                      <InputNumber
                        innerButtons
                        placeholder="任务编号"
                        min={1}
                        showClear
                        value={jobIdInputNumberValue(pc.inferJobId)}
                        onChange={(v) =>
                          pc.setInferJobId(
                            v == null || v === '' ? '' : String(v),
                          )
                        }
                        style={{ width: 110 }}
                      />
                      <Button
                        theme="outline"
                        onClick={async () => {
                          const id = Number(pc.inferJobId);
                          if (!id) return;
                          try {
                            const data = await pc.queryInferStatus(id);
                            rememberRecentJob(setRecentInferJobs, id);
                            if (!isTerminalStatus(data.status)) {
                              pc.startInferPolling(id);
                            }
                          } catch (e) {
                            pc.setInferStatusText(
                              '查询失败: ' + (e as Error).message,
                            );
                          }
                        }}
                      >
                        查询状态
                      </Button>
                    </Space>
                    <Space wrap>
                      <Text type="tertiary">当前状态：</Text>
                      <Text style={statusPillStyle(inferJobStatus)}>
                        {inferJobStatus || '-'}
                      </Text>
                      <Text type="tertiary">任务进行中会自动轮询</Text>
                    </Space>
                    {recentInferJobs.length ? (
                      <Space wrap>
                        <Text type="tertiary">最近任务：</Text>
                        {recentInferJobs.map((id) => (
                          <Button
                            key={id}
                            theme="light"
                            onClick={async () => {
                              pc.setInferJobId(String(id));
                              try {
                                const data = await pc.queryInferStatus(id);
                                rememberRecentJob(setRecentInferJobs, id);
                                if (!isTerminalStatus(data.status)) {
                                  pc.startInferPolling(id);
                                }
                              } catch (e) {
                                pc.setInferStatusText(
                                  '查询失败: ' + (e as Error).message,
                                );
                              }
                            }}
                          >
                            #{id}
                          </Button>
                        ))}
                      </Space>
                    ) : null}
                    <Space wrap>
                      <a
                        href={
                          pc.inferJobId
                            ? apiUrl(
                                `/api/infer/${pc.inferJobId}/export?format=csv`,
                              )
                            : '#'
                        }
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          pointerEvents: pc.inferJobId ? 'auto' : 'none',
                          opacity: pc.inferJobId ? 1 : 0.4,
                        }}
                      >
                        下载 CSV
                      </a>
                      <a
                        href={
                          pc.inferJobId
                            ? apiUrl(
                                `/api/infer/${pc.inferJobId}/export?format=json`,
                              )
                            : '#'
                        }
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          pointerEvents: pc.inferJobId ? 'auto' : 'none',
                          opacity: pc.inferJobId ? 1 : 0.4,
                        }}
                      >
                        下载 JSON
                      </a>
                    </Space>
                    <pre
                      style={{
                        ...mono,
                        margin: 0,
                        width: '100%',
                        flex: 1,
                        minHeight: 120,
                        padding: '8px 10px',
                        fontSize: 11,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        overflow: 'auto',
                        borderRadius: 8,
                        background: 'var(--semi-color-fill-0)',
                        border: '1px solid var(--semi-color-border)',
                        boxSizing: 'border-box',
                      }}
                    >
                      {pc.inferStatusText || ' '}
                    </pre>
                  </Space>
                </Card>
              </div>
            </Card>
          ) : null}

          {isTrainInferPage ? (
            <Card title="识别结果复核" bordered style={{ width: '100%' }}>
              <Space wrap style={{ marginBottom: 12 }}>
                <InputNumber
                  innerButtons
                  placeholder="识别任务编号"
                  min={1}
                  showClear
                  value={jobIdInputNumberValue(pc.reviewJobId)}
                  onChange={(v) =>
                    pc.setReviewJobId(v == null || v === '' ? '' : String(v))
                  }
                  style={{ width: 160 }}
                />
                <Select
                  style={{ width: 160 }}
                  optionList={[...REVIEW_PRED_ITEMS]}
                  value={pc.reviewPredClass}
                  onChange={(v) => pc.setReviewPredClass(String(v ?? ''))}
                />
                <Select
                  style={{ width: 160 }}
                  optionList={[...REVIEW_SORT_ITEMS]}
                  value={pc.reviewSortOrder}
                  onChange={(v) => pc.setReviewSortOrder(String(v ?? ''))}
                />
                <InputNumber
                  innerButtons
                  suffix="条"
                  min={1}
                  max={5000}
                  value={Number(pc.reviewLimit) || 200}
                  onChange={(v) => pc.setReviewLimit(String(v ?? 200))}
                  style={{ width: 100 }}
                />
                <Button
                  type="primary"
                  onClick={() => void pc.loadInferReviewResults()}
                >
                  加载复核结果
                </Button>
                {recentInferJobs.length ? (
                  <Button
                    theme="outline"
                    onClick={async () => {
                      const latest = recentInferJobs[0];
                      if (!latest) return;
                      pc.setReviewJobId(String(latest));
                      await pc.loadInferReviewResultsByJobId(latest);
                    }}
                  >
                    使用最近任务
                  </Button>
                ) : null}
                <Text type="tertiary">{pc.reviewMeta}</Text>
              </Space>
              <div className="plant-table-scroll-wrap" style={labelTablesWrap}>
                <Table<InferReviewItem>
                  columns={reviewColumns}
                  dataSource={pc.inferReviewItems}
                  rowKey={(r) => `${r?.filename ?? ''}-${r?.path ?? ''}`}
                  pagination={false}
                  empty={
                    <Text type="tertiary">
                      暂无可复核结果，请先加载识别任务
                    </Text>
                  }
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    tableLayout: 'fixed',
                  }}
                />
              </div>
            </Card>
          ) : null}

          {isModelsPage ? (
            <Card title="模型版本" bordered style={{ width: '100%' }}>
              <Space wrap style={{ marginBottom: 12 }}>
                <Button
                  theme="outline"
                  style={{ width: 'fit-content' }}
                  onClick={() => void pc.refreshModels()}
                >
                  刷新模型列表
                </Button>
                <Select
                  style={{ width: 120 }}
                  optionList={[
                    { label: '全部版本', value: 'all' },
                    { label: '仅已发布', value: 'published' },
                    { label: '仅未发布', value: 'unpublished' },
                  ]}
                  value={modelFilter}
                  onChange={(v) =>
                    setModelFilter(
                      String(v ?? 'all') as 'all' | 'published' | 'unpublished',
                    )
                  }
                />
                <Text type="tertiary">已发布版本置顶显示</Text>
              </Space>
              <div className="plant-table-scroll-wrap" style={tableScroll}>
                <Table<ModelRow>
                  columns={modelColumns}
                  dataSource={sortedModels}
                  rowKey="version"
                  pagination={false}
                  size="small"
                  empty={<Text type="tertiary">暂无模型</Text>}
                  style={{ minWidth: 760, tableLayout: 'fixed', width: '100%' }}
                  onRow={(record) =>
                    record?.is_published
                      ? {
                          style: {
                            background:
                              'var(--semi-color-success-light-default)',
                          },
                        }
                      : {}
                  }
                />
              </div>
            </Card>
          ) : null}
        </Space>
      </div>

      <Modal
        title={metricsModal ? `指标 · ${metricsModal.version}` : '指标'}
        visible={metricsModal != null}
        onCancel={() => setMetricsModal(null)}
        footer={
          <Button type="primary" onClick={() => setMetricsModal(null)}>
            关闭
          </Button>
        }
        width={720}
        bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
      >
        <pre
          style={{
            ...mono,
            margin: 0,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {metricsModal ? JSON.stringify(metricsModal.metrics, null, 2) : ''}
        </pre>
      </Modal>

      <PreviewDrawer
        pc={pc}
        previewItem={previewItem}
        previewInfo={previewInfo}
      />
    </div>
  );
}
