import React from 'react';

interface StatusPillProps {
  status: 'connected' | 'disconnected' | 'pairing' | 'expired';
  label?: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
  const configs = {
    connected: {
      color: 'bg-success',
      text: label || 'Connected',
      border: 'border-success/20',
      bg: 'bg-success-subtle',
      textColor: 'text-success',
    },
    disconnected: {
      color: 'bg-text-tertiary',
      text: label || 'Not Connected',
      border: 'border-default',
      bg: 'bg-surface-overlay',
      textColor: 'text-secondary',
    },
    pairing: {
      color: 'bg-warning animate-pulse',
      text: label || 'Pairing...',
      border: 'border-warning/20',
      bg: 'bg-warning-subtle',
      textColor: 'text-warning',
    },
    expired: {
      color: 'bg-danger',
      text: label || 'Session Expired',
      border: 'border-danger/20',
      bg: 'bg-danger-subtle',
      textColor: 'text-danger',
    },
  };

  const current = configs[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${current.border} ${current.bg} ${current.textColor}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.color}`} />
      <span>{current.text}</span>
    </span>
  );
}
