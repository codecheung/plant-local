import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Pagination,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from '@douyinfe/semi-ui';
import type { CSSProperties } from 'react';
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
  maxWidth: 1200,
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

const REVIEW_PRED_ITEMS = [
  { label: '全部预测类别', value: '' },
  { label: '目标植物', value: 'target_plant' },
  { label: '其他', value: 'other' },
] as const;

const REVIEW_SORT_ITEMS = [
  { label: '置信度从低到高', value: 'asc' },
  { label: '置信度从高到低', value: 'desc' },
] as const;

export function PlantConsole() {
  const pc = usePlantConsole();

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
      width: 52,
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
      width: 80,
      align: 'center',
    },
    {
      title: '预览',
      width: 112,
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
      // width: 300,
      /** 配合 tableLayout:fixed，避免长路径按内容宽度撑开列 */
      onCell: () => ({
        style: {
          maxWidth: 0,
          overflow: 'hidden',
          verticalAlign: 'top',
        },
      }),
      render: (_t, r, idx) => (
        <div
          style={{
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
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
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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
      width: 120,
      align: 'center',
      render: (_t, r) => <LabelStatusTag label={r.label} />,
    },
    {
      title: '复核',
      width: 72,
      align: 'center',
      render: (_t, r) => (r.reviewed ? '是' : '否'),
    },
    {
      title: '操作',
      width: 160,
      render: (_t, r) => (
        <Space wrap>
          <Button
            // type="success"
            theme="solid"
            onClick={() => void pc.saveLabel(r.id, 'target_plant')}
          >
            标为目标植物
          </Button>
          <Button
            type="warning"
            // theme="solid"
            onClick={() => void pc.saveLabel(r.id, 'other')}
          >
            标为其他
          </Button>
          <Button
            theme="outline"
            onClick={() => void pc.saveLabel(r.id, r.label || 'other', true)}
          >
            仅设复核
          </Button>
        </Space>
      ),
    },
  ];

  const opColumns: ColumnProps<LabelOp>[] = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: '22%',
      render: (v) => v ?? '-',
    },
    {
      title: '操作批次编号',
      dataIndex: 'operation_id',
      width: '30%',
      render: (v) => <span style={mono}>{String(v ?? '-')}</span>,
    },
    { title: '变更条数', dataIndex: 'changed_items', width: '11%' },
    { title: '新标注', dataIndex: 'newly_labeled_items', width: '11%' },
    { title: '重标注', dataIndex: 'relabeled_items', width: '11%' },
    {
      title: '操作',
      width: '15%',
      render: (_t, _r, i) => (
        <Button onClick={() => void pc.undoLabels((i ?? 0) + 1)}>
          撤销到此
        </Button>
      ),
    },
  ];

  const reviewColumns: ColumnProps<InferReviewItem>[] = [
    {
      title: '预览',
      width: 112,
      render: (_t, x) =>
        x.image_id ? (
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
        ) : (
          <Text type="tertiary">无预览</Text>
        ),
    },
    {
      title: '文件',
      width: '28%',
      render: (_t, x) => (
        <div>
          <Text>{x.filename ?? '-'}</Text>
          <Text type="tertiary" style={mono}>
            {x.path ?? '-'}
          </Text>
        </div>
      ),
    },
    {
      title: '预测类别',
      width: 100,
      render: (_t, x) => <LabelStatusTag label={x.predicted_class} />,
    },
    {
      title: '置信度',
      width: 104,
      dataIndex: 'confidence',
      render: (v) => v ?? '-',
    },
    {
      title: '当前标签',
      width: 120,
      render: (_t, x) => <LabelStatusTag label={x.current_label} />,
    },
    {
      title: '复核',
      width: 80,
      render: (_t, x) => (x.reviewed ? '是' : '否'),
    },
    {
      title: '纠正操作',
      minWidth: 320,
      render: (_t, x) =>
        x.image_id ? (
          <Space wrap>
            <Button
              className="plant-console-btn-target-plant"
              theme="solid"
              onClick={() =>
                void pc.fixReviewLabel(x.image_id!, 'target_plant')
              }
            >
              改为目标植物
            </Button>
            <Button
              type="warning"
              theme="solid"
              onClick={() => void pc.fixReviewLabel(x.image_id!, 'other')}
            >
              改为其他
            </Button>
            <Button
              theme="outline"
              onClick={() =>
                void pc.fixReviewLabel(x.image_id!, x.current_label || 'other')
              }
            >
              仅复核
            </Button>
          </Space>
        ) : (
          <Text type="tertiary">无法关联原图</Text>
        ),
    },
  ];

  const modelColumns: ColumnProps<ModelRow>[] = [
    { title: '版本', dataIndex: 'version', width: 140 },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: '24%',
      render: (v) => v ?? '-',
    },
    {
      title: '指标',
      width: '38%',
      render: (_t, m) => (
        <pre
          style={{
            ...mono,
            margin: 0,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {m.metrics ? JSON.stringify(m.metrics, null, 2) : '-'}
        </pre>
      ),
    },
    {
      title: '发布状态',
      width: 120,
      render: (_t, m) => (m.is_published ? '已发布' : '未发布'),
    },
    {
      title: '操作',
      width: 168,
      render: (_t, m) => (
        <Button onClick={() => void pc.publishModel(m.version)}>
          发布该版本
        </Button>
      ),
    },
  ];

  return (
    <div style={pageWrap}>
      <div style={container}>
        <Space
          align="center"
          style={{
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 24,
          }}
        >
          <Title heading={4} style={{ margin: 0 }}>
            植物识别本地训练控制台
          </Title>
        </Space>

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

          <Card title="标注统计" bordered style={{ width: '100%' }}>
            <Row gutter={[12, 12]}>
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
                      bordered
                      bodyStyle={{ padding: '12px 16px' }}
                      style={{ height: '100%' }}
                    >
                      <Text type="tertiary">{k}</Text>
                      <Title heading={3} style={{ margin: '4px 0 0' }}>
                        {v}
                      </Title>
                    </Card>
                  </Col>
                ))}
            </Row>
          </Card>

          <Card title="图片列表与快速标注" bordered style={{ width: '100%' }}>
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
              <Space wrap>
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
                  style={{ width: 160 }}
                  optionList={[...FILTER_REVIEWED_ITEMS]}
                  value={pc.filterReviewed}
                  onChange={(v) => pc.setFilterReviewed(String(v ?? ''))}
                />
                <Button type="primary" onClick={() => void pc.refreshImages()}>
                  查询
                </Button>
                <Button theme="outline" onClick={() => void pc.onlyUnlabeled()}>
                  仅看未标注
                </Button>
                <Input
                  type="number"
                  value={pc.randomCount}
                  onChange={(v) => pc.setRandomCount(v)}
                  style={{ width: 100 }}
                />
                <Button
                  theme="outline"
                  onClick={() => void pc.randomUnlabeled()}
                >
                  随机抽样待标注
                </Button>
                <Checkbox
                  checked={pc.quickMode}
                  onChange={(e) => pc.setQuickMode(e.target.checked ?? false)}
                >
                  <Text>连续标注模式</Text>
                </Checkbox>
                <Button theme="borderless" onClick={() => pc.moveFocus(-1)}>
                  上一条
                </Button>
                <Button theme="borderless" onClick={() => pc.moveFocus(1)}>
                  下一条
                </Button>
                <Text type="tertiary">{pc.focusMeta}</Text>
                <Text type="tertiary">
                  快捷键：`1/2` 标注，`↑/↓` 切换，`z` 撤销 1 次
                </Text>
              </Space>

              <Space wrap>
                <Button theme="light" onClick={() => void pc.clearSelection()}>
                  清空选择
                </Button>
                <Button
                  className="plant-console-btn-target-plant"
                  theme="solid"
                  onClick={() => void pc.batchSaveLabel('target_plant', true)}
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
                <InputNumber
                  innerButtons
                  suffix="步"
                  min={1}
                  max={20}
                  value={Number(pc.undoSteps) || 1}
                  onChange={(v) => pc.setUndoSteps(String(v ?? 1))}
                  style={{ width: 190 }}
                />
                <Button
                  type="danger"
                  onClick={() => void pc.undoLabels(Number(pc.undoSteps))}
                >
                  撤销最近标注
                </Button>
                <Text type="tertiary">已选 {pc.selectedImageIds.size} 条</Text>
              </Space>

              <div className="plant-table-scroll-wrap" style={tableScroll}>
                <Table<ImageItem>
                  columns={imageColumns}
                  dataSource={pc.currentImageItems}
                  rowKey="id"
                  pagination={false}
                  empty={<Text type="tertiary">暂无数据</Text>}
                  style={{
                    minWidth: 1040,
                    tableLayout: 'fixed',
                    width: '100%',
                  }}
                  onRow={(_record, index) => ({
                    style: {
                      background:
                        index === pc.focusedRowIndex
                          ? 'var(--semi-color-primary-light-default)'
                          : undefined,
                    },
                  })}
                />
              </div>

              <Space wrap align="center">
                <Text type="tertiary">{pc.pageMeta}</Text>
                {pc.totalPages > 0 ||
                (pc.totalImageCount === 0 &&
                  pc.currentImageItems.length === 0) ? (
                  <>
                    <Text>第</Text>
                    <InputNumber
                      innerButtons
                      min={1}
                      max={pc.totalPages > 0 ? pc.totalPages : 999999}
                      value={Number(pc.page) || 1}
                      onChange={(v) => pc.setPage(String(v ?? 1))}
                      style={{ width: 100 }}
                    />
                    <Text>页</Text>
                    <Text>每页</Text>
                    <InputNumber
                      innerButtons
                      min={1}
                      max={500}
                      value={Number(pc.pageSize) || 20}
                      onChange={(v) => pc.setPageSize(String(v ?? 20))}
                      style={{ width: 100 }}
                    />
                    <Text>条</Text>
                    {pc.totalImageCount > 0 ? (
                      <Pagination
                        total={pc.totalImageCount}
                        pageSize={Math.max(1, Number(pc.pageSize || 20))}
                        currentPage={pc.serverPage}
                        onChange={(p) => void pc.goToAbsolutePage(p)}
                        showSizeChanger={false}
                      />
                    ) : null}
                  </>
                ) : null}
              </Space>
            </Space>
          </Card>

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
                style={{ width: 140 }}
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
            <div className="plant-table-scroll-wrap" style={tableScroll}>
              <Table<LabelOp>
                columns={opColumns}
                dataSource={pc.opLogs}
                rowKey="operation_id"
                pagination={false}
                empty={<Text type="tertiary">暂无标注日志</Text>}
                style={{ minWidth: 860, tableLayout: 'fixed', width: '100%' }}
              />
            </div>
          </Card>

          <Card title="训练" bordered style={{ width: '100%' }}>
            <Space wrap>
              <Select
                style={{ width: 140 }}
                optionList={[...TRAIN_MODE_ITEMS]}
                value={pc.trainMode}
                onChange={(v) => pc.setTrainMode(String(v ?? ''))}
              />
              <Input
                placeholder="基础版本（继续训练可填）"
                value={pc.baseVersion}
                onChange={(v) => pc.setBaseVersion(v)}
                style={{ maxWidth: 240 }}
              />
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    const data = await api<{ job_id: number }>(
                      '/api/train/start',
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          mode: pc.trainMode,
                          base_version: pc.baseVersion.trim() || null,
                        }),
                      },
                    );
                    pc.setTrainJobId(String(data.job_id));
                    pc.setTrainMsg({
                      ok: true,
                      text: `训练任务已启动 job_id=${data.job_id}`,
                    });
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
              <Input
                type="number"
                placeholder="任务编号"
                value={pc.trainJobId}
                onChange={(v) => pc.setTrainJobId(v)}
                style={{ width: 120 }}
              />
              <Button
                theme="outline"
                onClick={async () => {
                  const id = Number(pc.trainJobId);
                  if (!id) return;
                  try {
                    const data = await pc.queryTrainStatus(id);
                    if (!isTerminalStatus(data.status)) {
                      pc.startTrainPolling(id);
                    }
                  } catch (e) {
                    pc.setTrainStatusText('查询失败: ' + (e as Error).message);
                  }
                }}
              >
                查训练状态
              </Button>
              <Text type="tertiary">任务进行中会自动轮询</Text>
            </Space>
            {pc.trainMsg && (
              <Text
                style={{
                  marginTop: 8,
                  color: pc.trainMsg.ok
                    ? 'var(--semi-color-success)'
                    : 'var(--semi-color-danger)',
                }}
              >
                {pc.trainMsg.text}
              </Text>
            )}
            <pre
              style={{
                ...mono,
                marginTop: 8,
                padding: 12,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                borderRadius: 8,
                background: 'var(--semi-color-fill-0)',
                border: '1px solid var(--semi-color-border)',
              }}
            >
              {pc.trainStatusText || ' '}
            </pre>
          </Card>

          <Card title="识别" bordered style={{ width: '100%' }}>
            <Space wrap>
              <Input
                placeholder="模型版本（留空用已发布或最新）"
                value={pc.inferModelVersion}
                onChange={(v) => pc.setInferModelVersion(v)}
                style={{ maxWidth: 260 }}
              />
              <Input
                placeholder="识别目录（留空默认 data/raw）"
                value={pc.inferInputDir}
                onChange={(v) => pc.setInferInputDir(v)}
                style={{ flex: 1, minWidth: 280 }}
              />
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    const data = await api<{ job_id: number }>(
                      '/api/infer/start',
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          model_version: pc.inferModelVersion.trim() || null,
                          input_dir: pc.inferInputDir.trim() || null,
                        }),
                      },
                    );
                    pc.setInferJobId(String(data.job_id));
                    pc.setReviewJobId(String(data.job_id));
                    pc.setInferMsg({
                      ok: true,
                      text: `识别任务已启动 job_id=${data.job_id}`,
                    });
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
              <Input
                type="number"
                placeholder="任务编号"
                value={pc.inferJobId}
                onChange={(v) => pc.setInferJobId(v)}
                style={{ width: 120 }}
              />
              <Button
                theme="outline"
                onClick={async () => {
                  const id = Number(pc.inferJobId);
                  if (!id) return;
                  try {
                    const data = await pc.queryInferStatus(id);
                    if (!isTerminalStatus(data.status)) {
                      pc.startInferPolling(id);
                    }
                  } catch (e) {
                    pc.setInferStatusText('查询失败: ' + (e as Error).message);
                  }
                }}
              >
                查识别状态
              </Button>
              <Text type="tertiary">任务进行中会自动轮询</Text>
            </Space>
            {pc.inferMsg && (
              <Text
                style={{
                  marginTop: 8,
                  color: pc.inferMsg.ok
                    ? 'var(--semi-color-success)'
                    : 'var(--semi-color-danger)',
                }}
              >
                {pc.inferMsg.text}
              </Text>
            )}
            <Space style={{ marginTop: 8 }}>
              <a
                href={
                  pc.inferJobId
                    ? apiUrl(`/api/infer/${pc.inferJobId}/export?format=csv`)
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
                    ? apiUrl(`/api/infer/${pc.inferJobId}/export?format=json`)
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
                marginTop: 8,
                padding: 12,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                borderRadius: 8,
                background: 'var(--semi-color-fill-0)',
                border: '1px solid var(--semi-color-border)',
              }}
            >
              {pc.inferStatusText || ' '}
            </pre>
          </Card>

          <Card title="识别结果复核" bordered style={{ width: '100%' }}>
            <Space wrap style={{ marginBottom: 12 }}>
              <Input
                type="number"
                placeholder="识别任务编号"
                value={pc.reviewJobId}
                onChange={(v) => pc.setReviewJobId(v)}
                style={{ width: 140 }}
              />
              <Select
                style={{ width: 160 }}
                optionList={[...REVIEW_PRED_ITEMS]}
                value={pc.reviewPredClass}
                onChange={(v) => pc.setReviewPredClass(String(v ?? ''))}
              />
              <Select
                style={{ width: 200 }}
                optionList={[...REVIEW_SORT_ITEMS]}
                value={pc.reviewSortOrder}
                onChange={(v) => pc.setReviewSortOrder(String(v ?? ''))}
              />
              <Input
                type="number"
                value={pc.reviewLimit}
                onChange={(v) => pc.setReviewLimit(v)}
                style={{ width: 100 }}
              />
              <Button
                type="primary"
                onClick={() => void pc.loadInferReviewResults()}
              >
                加载复核结果
              </Button>
              <Text type="tertiary">{pc.reviewMeta}</Text>
            </Space>
            <div className="plant-table-scroll-wrap" style={tableScroll}>
              <Table<InferReviewItem>
                columns={reviewColumns}
                dataSource={pc.inferReviewItems}
                rowKey={(r) => `${r?.filename ?? ''}-${r?.path ?? ''}`}
                pagination={false}
                empty={
                  <Text type="tertiary">暂无可复核结果，请先加载识别任务</Text>
                }
                style={{ minWidth: 1120, tableLayout: 'fixed', width: '100%' }}
              />
            </div>
          </Card>

          <Card title="模型版本" bordered style={{ width: '100%' }}>
            <Button
              theme="outline"
              style={{ marginBottom: 12, width: 'fit-content' }}
              onClick={() => void pc.refreshModels()}
            >
              刷新模型列表
            </Button>
            <div className="plant-table-scroll-wrap" style={tableScroll}>
              <Table<ModelRow>
                columns={modelColumns}
                dataSource={pc.models}
                rowKey="version"
                pagination={false}
                empty={<Text type="tertiary">暂无模型</Text>}
                style={{ minWidth: 800, tableLayout: 'fixed', width: '100%' }}
              />
            </div>
          </Card>
        </Space>
      </div>

      <PreviewDrawer
        pc={pc}
        previewItem={previewItem}
        previewInfo={previewInfo}
      />
    </div>
  );
}
