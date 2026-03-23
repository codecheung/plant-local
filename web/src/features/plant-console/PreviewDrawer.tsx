import { Button, Checkbox, Space, Typography } from '@douyinfe/semi-ui';
import { useEffect, type CSSProperties } from 'react';
import { apiUrl } from '@/api/client';
import type { ImageItem } from './types';
import type { PlantConsoleApi } from './usePlantConsole';
import { LabelStatusTag } from './LabelStatusTag';

const { Text } = Typography;

const mono: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

export function PreviewDrawer({
  pc,
  previewItem,
  previewInfo,
}: {
  pc: PlantConsoleApi;
  previewItem: ImageItem | null;
  previewInfo: { label: string | null; reviewed: boolean } | null;
}) {
  useEffect(() => {
    if (!pc.previewOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [pc.previewOpen]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        width: 'min(56vw, 860px)',
        maxWidth: '100vw',
        background: 'var(--semi-color-bg-2)',
        color: 'var(--semi-color-text-0)',
        borderLeft: '1px solid var(--semi-color-border)',
        boxShadow: 'var(--semi-shadow-elevated)',
        zIndex: 400,
        transform: pc.previewOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
      onWheelCapture={(e) => {
        if (pc.previewOpen) e.preventDefault();
      }}
      aria-hidden={!pc.previewOpen}
    >
      <Space
        wrap
        style={{
          padding: 10,
          borderBottom: '1px solid var(--semi-color-border)',
        }}
      >
        <Button theme="outline" onClick={pc.closePreview}>
          关闭(Esc)
        </Button>
        <Button theme="outline" onClick={() => pc.navigatePreview(-1)}>
          上一张(A)
        </Button>
        <Button theme="outline" onClick={() => pc.navigatePreview(1)}>
          下一张(D)
        </Button>
        <Button
          theme="outline"
          onClick={() => pc.navigatePreviewUnreviewed(-1)}
        >
          上一张未复核(,)
        </Button>
        <Button theme="outline" onClick={() => pc.navigatePreviewUnreviewed(1)}>
          下一张未复核(.)
        </Button>
        <Button theme="outline" onClick={() => pc.zoomPreview(1.2)}>
          放大(+)
        </Button>
        <Button theme="outline" onClick={() => pc.zoomPreview(1 / 1.2)}>
          缩小(-)
        </Button>
        <Button theme="outline" onClick={pc.resetPreviewTransform}>
          重置
        </Button>
        <Button
          className="plant-console-btn-target-plant"
          theme="solid"
          onClick={() => void pc.previewLabelCurrent('target_plant')}
        >
          标为目标植物(1)
        </Button>
        <Button
          type="warning"
          theme="solid"
          onClick={() => void pc.previewLabelCurrent('other')}
        >
          标为其他(2)
        </Button>
        <Button theme="outline" onClick={() => void pc.previewReviewCurrent()}>
          仅复核(R)
        </Button>
        <Checkbox
          checked={pc.previewOnlyUnreviewed}
          onChange={(e) => {
            pc.setPreviewOnlyUnreviewed(e.target.checked ?? false);
            pc.openPreviewByIndex(pc.previewIndex < 0 ? 0 : pc.previewIndex);
          }}
        >
          <Text type="tertiary">只看未复核(U)</Text>
        </Checkbox>
        <Text type="tertiary">
          当前 {pc.previewOpen ? pc.previewIndex + 1 : 0}/
          {pc.currentImageItems.length}
        </Text>
        <Text type="tertiary">未复核剩余：{pc.getUnreviewedRemainCount()}</Text>
      </Space>
      <div
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'hidden',
          background: 'var(--semi-color-fill-0)',
          touchAction: 'none',
        }}
        onWheel={(e) => {
          if (!pc.previewOpen) return;
          e.preventDefault();
          pc.zoomPreview(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }}
        onMouseDown={pc.onPreviewMouseDown}
      >
        {previewItem && (
          <img
            alt={previewItem.filename}
            draggable={false}
            src={apiUrl(`/api/images/${previewItem.id}/preview`)}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              maxWidth: 'none',
              maxHeight: 'none',
              transform: `translate(calc(-50% + ${pc.previewOffset.x}px), calc(-50% + ${pc.previewOffset.y}px)) scale(${pc.previewScale})`,
              cursor: pc.previewDragging.current ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          />
        )}
      </div>
      <div
        style={{
          padding: 10,
          borderTop: '1px solid var(--semi-color-border)',
          fontSize: 12,
        }}
      >
        <Space wrap style={{ marginBottom: 8 }} align="center">
          <span style={{ color: 'var(--semi-color-text-2)' }}>标签</span>
          <LabelStatusTag label={previewInfo?.label} />
          <span
            style={{
              padding: '1px 8px',
              borderRadius: 999,
              border: '1px solid var(--semi-color-border)',
              background: 'var(--semi-color-fill-0)',
            }}
          >
            复核: {previewInfo ? (previewInfo.reviewed ? '是' : '否') : '-'}
          </span>
        </Space>
        <div>{previewItem?.filename ?? '-'}</div>
        <div style={{ ...mono, color: 'var(--semi-color-text-2)' }}>
          {previewItem?.storage_path ?? '-'}
        </div>
      </div>
    </div>
  );
}
