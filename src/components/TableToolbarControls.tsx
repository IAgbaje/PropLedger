import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Download, ListFilter, Search, X } from 'lucide-react';

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

export interface FilterMenuOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterMenuSection {
  title?: string;
  options: FilterMenuOption[];
}

interface FilterMenuButtonProps {
  label?: string;
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  options?: FilterMenuOption[];
  sections?: FilterMenuSection[];
  ariaLabel?: string;
  align?: 'left' | 'right';
  className?: string;
}

export function FilterMenuButton({
  label = 'Filter',
  value,
  defaultValue = 'All',
  onChange,
  options,
  sections,
  ariaLabel = 'Filter options',
  align = 'right',
  className = '',
}: FilterMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const resolvedSections: FilterMenuSection[] = sections
    ? sections
    : [{ options: options || [] }];

  const allOptions = resolvedSections.flatMap((s) => s.options);
  const selectedOption = allOptions.find((o) => o.value === value);
  const isFiltered = value !== defaultValue;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        className={`min-h-[44px] w-full sm:w-auto inline-flex items-center justify-between sm:justify-center gap-2 px-3.5 py-2 rounded-xl text-[0.875rem] border transition-colors whitespace-nowrap ${
          isFiltered
            ? 'font-semibold border-transparent'
            : 'bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] font-medium hover:bg-[var(--bg-surface-tertiary)]'
        }`}
        style={
          isFiltered
            ? {
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
              }
            : { borderColor: 'var(--border-subtle)' }
        }
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <ListFilter className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {isFiltered
              ? `${label}: ${selectedOption?.label ?? value}`
              : `${label}: ${selectedOption?.label ?? 'All'}`}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 opacity-75 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className={`absolute z-40 mt-2 min-w-[240px] w-max max-w-[min(320px,calc(100vw-2rem))] rounded-2xl border p-1.5 max-h-[360px] overflow-y-auto ${
            align === 'left' ? 'left-0' : 'left-0 sm:left-auto sm:right-0'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-hairline)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {resolvedSections.map((section, idx) => (
            <div
              key={section.title || `sec-${idx}`}
              className={idx > 0 ? 'mt-1.5 pt-1.5 border-t' : ''}
              style={idx > 0 ? { borderColor: 'var(--border-subtle)' } : undefined}
            >
              {section.title && (
                <div className="px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-[var(--ink-tertiary)]">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.options.map((opt) => {
                  const selected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-left text-[0.875rem] transition-colors ${
                        selected
                          ? 'font-semibold'
                          : 'text-[var(--ink-primary)] hover:bg-[var(--bg-hover)] font-normal'
                      }`}
                      style={
                        selected
                          ? {
                              backgroundColor: 'var(--accent-soft)',
                              color: 'var(--accent-ink)',
                            }
                          : undefined
                      }
                    >
                      <span className="truncate">{opt.label}</span>
                      <span className="inline-flex items-center gap-2 shrink-0">
                        {opt.count !== undefined && (
                          <span
                            className={`text-[0.75rem] font-mono-nums ${
                              selected ? 'opacity-90' : 'text-[var(--ink-tertiary)]'
                            }`}
                          >
                            {opt.count}
                          </span>
                        )}
                        {selected && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
