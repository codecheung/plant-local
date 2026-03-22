import { Tag } from '@douyinfe/semi-ui';
import { labelToText } from './utils';

/** 当前标签 / 预测类别等：Semi 状态标签 */
export function LabelStatusTag({
  label,
}: {
  label: string | null | undefined;
}) {
  if (label === 'target_plant') {
    return (
      <Tag color="green" type="light">
        目标植物
      </Tag>
    );
  }
  if (label === 'other') {
    return (
      <Tag color="orange" type="light">
        其他
      </Tag>
    );
  }
  if (label == null || label === '') {
    return (
      <Tag color="grey" type="light">
        未标注
      </Tag>
    );
  }
  const text = labelToText(label);
  return (
    <Tag color="grey" type="light">
      {text === '-' ? label : text}
    </Tag>
  );
}
