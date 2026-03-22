export function labelToText(label: string | null | undefined): string {
  if (label === 'target_plant') return '目标植物';
  if (label === 'other') return '其他';
  return '-';
}

export function isTerminalStatus(status: string): boolean {
  return status === 'success' || status === 'failed';
}
