import React from 'react';
import { Download, Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search unit number or tenant name...',
  ariaLabel = 'Search by unit number or tenant name',
  className = 'w-full sm:w-72',
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="w-4 h-4 text-[var(--ink-tertiary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="hig-input w-full !pl-10 !pr-11"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

interface ExportCsvButtonProps {
  onClick: () => void;
  disabled?: boolean;
  count?: number;
  label?: string;
  title?: string;
}

export function ExportCsvButton({
  onClick,
  disabled = false,
  count,
  label = 'Export CSV',
  title = 'Export current filtered rows to CSV',
}: ExportCsvButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="hig-btn-secondary whitespace-nowrap shrink-0"
    >
      <Download className="w-4 h-4 shrink-0" />
      <span>{count !== undefined ? `${label} (${count})` : label}</span>
    </button>
  );
}
