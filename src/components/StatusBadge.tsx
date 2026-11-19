import React from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'ink';

const TONE_VARS: Record<Tone, { bg: string; color: string; dot: string }> = {
  neutral: {
    bg: 'var(--status-neutral-bg)',
    color: 'var(--status-neutral-ink)',
    dot: 'var(--status-neutral-ink)',
  },
  success: {
    bg: 'var(--status-success-bg)',
    color: 'var(--status-success-ink)',
    dot: 'var(--status-success-ink)',
  },
  warning: {
    bg: 'var(--status-warning-bg)',
    color: 'var(--status-warning-ink)',
    dot: 'var(--status-warning-ink)',
  },
  danger: {
    bg: 'var(--status-danger-bg)',
    color: 'var(--status-danger-ink)',
    dot: 'var(--status-danger-ink)',
  },
  ink: {
    bg: 'var(--status-ink-bg)',
    color: 'var(--status-ink-text)',
    dot: 'var(--status-ink-text)',
  },
};

export function toneForStatus(status: string): Tone {
  switch (status) {
    case 'Paid / Settled':
    case 'Confirmed':
    case 'Issued':
    case 'Delivered':
    case 'Fulfilled':
    case 'Current':
    case 'Active':
    case 'Occupied':
    case 'Resolved':
    case 'Valid':
      return 'success';
    case 'Partially Paid':
    case 'Due':
    case 'Acknowledged':
    case 'Notified':
    case 'Sent':
    case 'Retry Pending':
    case 'Partially Fulfilled':
    case 'Occasional Late Payment':
    case 'Repeated Late Payment':
    case 'Under Review':
    case 'Under Maintenance':
    case 'In Progress':
    case 'Warning':
    case 'Open':
    case 'Multiple Dues (Rent + Levy)':
      return 'warning';
    case 'Overdue':
    case 'Reversed':
    case 'Correction Required':
    case 'Failed':
    case 'Exhausted / Action Required':
    case 'Breached':
    case 'Persistent Arrears':
    case 'Chronic Delinquency':
    case 'Multi-Year Debtor':
    case 'Error':
      return 'danger';
    case 'Upcoming':
    case 'Created':
    case 'Queued':
    case 'Draft':
    case 'Vacant':
    case 'Renewed / Superseded':
    case 'Expired':
    case 'Cancelled':
    case 'Terminated':
    default:
      return 'neutral';
  }
}

export function StatusBadge({
  label,
  tone,
  showDot = false,
  wrap = false,
}: {
  label: string;
  tone?: Tone;
  showDot?: boolean;
  wrap?: boolean;
}) {
  const resolved = tone ?? toneForStatus(label);
  const styles = TONE_VARS[resolved];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 rounded-lg text-[0.75rem] font-semibold tracking-[-0.005em] ${
        wrap
          ? 'min-h-6 py-1 whitespace-normal leading-tight text-left'
          : 'min-h-6 py-0.5 whitespace-nowrap shrink-0'
      }`}
      style={{
        backgroundColor: styles.bg,
        color: styles.color,
      }}
    >
      {showDot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: styles.dot }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  );
}
