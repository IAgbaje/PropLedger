import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { Agreement } from '../types/rental';
import { parseCurrencyValue } from '../utils/format';
import { CurrencyInput } from './CurrencyInput';

interface AddCycleObligationInlineProps {
  agreement?: Agreement;
  suggestedYear?: string;
  onCreated?: (rentObligationId?: string, cycleYear?: string) => void;
  onCancel: () => void;
}

export function AddCycleObligationInline({
  agreement,
  suggestedYear = '2027',
  onCreated,
  onCancel,
}: AddCycleObligationInlineProps) {
  const { state, createCycleObligation } = useRentalStore();
  const [cycleYear, setCycleYear] = useState(suggestedYear);
  const [periodLabel, setPeriodLabel] = useState(`${suggestedYear} Annual Rent`);
  const [labelTouched, setLabelTouched] = useState(false);
  const [rentAmountStr, setRentAmountStr] = useState(
    agreement ? String(agreement.agreedRent) : ''
  );
  const [levyAmountStr, setLevyAmountStr] = useState(
    agreement ? String(agreement.securityLevy) : String(state.settings.securityLevyAmount)
  );
  const [dueDate, setDueDate] = useState(() => {
    const baseDue = agreement?.dueDate || `${suggestedYear}-01-31`;
    const yr = Number(suggestedYear.slice(0, 4));
    if (/^\d{4}-\d{2}-\d{2}$/.test(baseDue) && Number.isFinite(yr)) {
      return `${yr}${baseDue.slice(4)}`;
    }
    return `${suggestedYear.slice(0, 4)}-01-31`;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!labelTouched && cycleYear.trim()) {
      setPeriodLabel(`${cycleYear.trim()} Annual Rent`);
    }
  }, [cycleYear, labelTouched]);

  useEffect(() => {
    if (agreement) {
      setRentAmountStr(String(agreement.agreedRent));
      setLevyAmountStr(String(agreement.securityLevy));
    }
  }, [agreement]);

  if (!agreement) {
    return (
      <div className="hig-card p-3 text-[13px]" style={{ color: 'var(--status-danger-ink)' }}>
        Select a tenancy agreement before adding a rent cycle obligation.
      </div>
    );
  }

  const handleCycleYearChange = (nextYear: string) => {
    setCycleYear(nextYear);
    const yrMatch = nextYear.match(/\b(20\d{2})\b/);
    if (yrMatch && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setDueDate(`${yrMatch[1]}${dueDate.slice(4)}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');

    const res = createCycleObligation({
      agreementId: agreement.id,
      cycleYear: cycleYear.trim(),
      rentalPeriodLabel: periodLabel.trim(),
      rentAmount: parseCurrencyValue(rentAmountStr),
      levyAmount: parseCurrencyValue(levyAmountStr),
      dueDate,
    });

    if (!res.ok) {
      setError(res.error || 'Unable to add rent cycle.');
      return;
    }

    onCreated?.(res.rentObligationId, cycleYear.trim());
  };

  return (
    <div
      className="hig-card p-3.5 space-y-3 border"
      style={{ borderColor: 'var(--accent-ink)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h5 className="hig-subhead font-semibold text-[var(--ink-primary)]">
            Add Rent Year Obligation
          </h5>
          <p className="hig-caption">
            Generate a missing cycle (e.g. 2026 or 2027 pre-cycle rent) to allocate payments accurately.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="hig-touch-icon shrink-0"
          aria-label="Close add rent year form"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p
          className="text-[12.5px] px-3 py-2 rounded-xl"
          style={{
            backgroundColor: 'var(--status-danger-bg)',
            color: 'var(--status-danger-ink)',
          }}
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block hig-caption font-semibold mb-1">
            Rent Year / Cycle
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['2025', '2026', '2027', '2028'].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => handleCycleYearChange(yr)}
                className="min-h-[34px] px-2.5 rounded-lg text-[12.5px] font-semibold font-mono-nums transition-colors border"
                style={
                  cycleYear === yr
                    ? {
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                        borderColor: 'var(--accent)',
                      }
                    : {
                        backgroundColor: 'var(--bg-surface-secondary)',
                        color: 'var(--ink-primary)',
                        borderColor: 'var(--border-hairline)',
                      }
                }
              >
                {yr}
              </button>
            ))}
            <input
              type="text"
              value={cycleYear}
              onChange={(e) => handleCycleYearChange(e.target.value)}
              placeholder="e.g. 2026/2027"
              aria-label="Custom rent year or cycle"
              className="hig-input flex-1 min-w-[100px] font-mono-nums"
            />
          </div>
        </div>

        <div>
          <label className="block hig-caption font-semibold mb-1">
            Obligation Label
          </label>
          <input
            type="text"
            value={periodLabel}
            onChange={(e) => {
              setLabelTouched(true);
              setPeriodLabel(e.target.value);
            }}
            placeholder="e.g. 2027 Annual Rent"
            aria-label="Obligation period label"
            className="hig-input w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block hig-caption font-semibold mb-1">
            Rent Amount (₦)
          </label>
          <CurrencyInput
            min={0}
            value={rentAmountStr}
            onValueChange={(raw) => setRentAmountStr(raw)}
            placeholder="e.g. 170,000"
            className="hig-input w-full"
          />
        </div>

        <div>
          <label className="block hig-caption font-semibold mb-1">
            Security Levy (₦)
          </label>
          <CurrencyInput
            min={0}
            value={levyAmountStr}
            onValueChange={(raw) => setLevyAmountStr(raw)}
            placeholder="0"
            className="hig-input w-full"
          />
        </div>

        <div>
          <label className="block hig-caption font-semibold mb-1">
            Cycle Due Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Cycle due date"
            className="hig-input w-full font-mono-nums"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="hig-btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} className="hig-btn-primary">
          <Plus className="w-4 h-4" />
          <span>Create Obligation</span>
        </button>
      </div>
    </div>
  );
}
