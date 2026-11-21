import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { Agreement } from '../types/rental';
import { parseCurrencyValue } from '../utils/format';
import { CurrencyInput } from './CurrencyInput';

type CycleCategoryChoice = 'rent-and-levy' | 'rent-only' | 'levy-only' | `custom:${string}` | 'custom-new';

interface AddCycleObligationInlineProps {
  agreement?: Agreement;
  suggestedYear?: string;
  onCreated?: (primaryObligationId?: string, cycleYear?: string) => void;
  onCancel: () => void;
}

export function AddCycleObligationInline({
  agreement,
  suggestedYear = '2027',
  onCreated,
  onCancel,
}: AddCycleObligationInlineProps) {
  const { state, createCycleObligation } = useRentalStore();
  const customCategories = state.settings.customPaymentCategories ?? [];

  const [choice, setChoice] = useState<CycleCategoryChoice>('rent-and-levy');
  const [cycleYear, setCycleYear] = useState(suggestedYear);
  const [periodLabel, setPeriodLabel] = useState(`${suggestedYear} Annual Rent`);
  const [labelTouched, setLabelTouched] = useState(false);
  const [rentAmountStr, setRentAmountStr] = useState(
    agreement ? String(agreement.agreedRent) : ''
  );
  const [levyAmountStr, setLevyAmountStr] = useState(
    agreement ? String(agreement.securityLevy) : String(state.settings.securityLevyAmount)
  );
  const [customCategoryLabel, setCustomCategoryLabel] = useState('');
  const [customAmountStr, setCustomAmountStr] = useState('');
  const [customCommissionEligible, setCustomCommissionEligible] = useState(false);
  const [dueDate, setDueDate] = useState(() => {
    const baseDue = agreement?.dueDate || `${suggestedYear}-01-31`;
    const yr = Number(suggestedYear.slice(0, 4));
    if (/^\d{4}-\d{2}-\d{2}$/.test(baseDue) && Number.isFinite(yr)) {
      return `${yr}${baseDue.slice(4)}`;
    }
    return `${suggestedYear.slice(0, 4)}-01-31`;
  });
  const [error, setError] = useState('');

  const selectedSavedCustom = choice.startsWith('custom:')
    ? customCategories.find((c) => `custom:${c.id}` === choice)
    : undefined;

  useEffect(() => {
    if (labelTouched || !cycleYear.trim()) return;
    const yr = cycleYear.trim();
    if (choice === 'levy-only') {
      setPeriodLabel(`${yr} Security Levy`);
    } else if (choice.startsWith('custom:')) {
      setPeriodLabel(`${yr} ${selectedSavedCustom?.label || 'Charge'}`);
    } else if (choice === 'custom-new') {
      setPeriodLabel(`${yr} ${customCategoryLabel.trim() || 'Other Charge'}`);
    } else {
      setPeriodLabel(`${yr} Annual Rent`);
    }
  }, [cycleYear, choice, labelTouched, selectedSavedCustom, customCategoryLabel]);

  useEffect(() => {
    if (agreement) {
      setRentAmountStr(String(agreement.agreedRent));
      setLevyAmountStr(String(agreement.securityLevy));
    }
  }, [agreement]);

  if (!agreement) {
    return (
      <div className="hig-card p-3 text-[13px]" style={{ color: 'var(--status-danger-ink)' }}>
        Select a tenancy agreement before adding a cycle obligation.
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

  const handleChoiceChange = (nextChoice: CycleCategoryChoice) => {
    setChoice(nextChoice);
    setLabelTouched(false);
    if (nextChoice.startsWith('custom:')) {
      const cat = customCategories.find((c) => `custom:${c.id}` === nextChoice);
      if (cat?.defaultAmount) {
        setCustomAmountStr(String(cat.defaultAmount));
      }
      setCustomCommissionEligible(Boolean(cat?.commissionEligible));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');

    const isCustomChoice = choice === 'custom-new' || choice.startsWith('custom:');
    const res = createCycleObligation({
      agreementId: agreement.id,
      cycleYear: cycleYear.trim(),
      rentalPeriodLabel: periodLabel.trim(),
      rentAmount:
        choice === 'rent-and-levy' || choice === 'rent-only' ? parseCurrencyValue(rentAmountStr) : 0,
      levyAmount:
        choice === 'rent-and-levy' || choice === 'levy-only' ? parseCurrencyValue(levyAmountStr) : 0,
      categoryMode:
        choice === 'rent-and-levy' || choice === 'rent-only' || choice === 'levy-only'
          ? choice
          : 'custom',
      categoryId: selectedSavedCustom?.id,
      categoryLabel: selectedSavedCustom?.label || customCategoryLabel.trim() || undefined,
      commissionEligible: selectedSavedCustom
        ? selectedSavedCustom.commissionEligible
        : customCommissionEligible,
      customAmount: isCustomChoice ? parseCurrencyValue(customAmountStr) : 0,
      dueDate,
    });

    if (!res.ok) {
      setError(res.error || 'Unable to add cycle obligation.');
      return;
    }

    onCreated?.(res.rentObligationId || res.createdObligationIds?.[0], cycleYear.trim());
  };

  return (
    <div
      className="hig-card p-3.5 space-y-3 border"
      style={{ borderColor: 'var(--accent-ink)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h5 className="hig-subhead font-semibold text-[var(--ink-primary)]">
            Add Rent Year / Charge Obligation
          </h5>
          <p className="hig-caption">
            Generate a missing cycle (e.g. 2025 Security Levy, 2026 Rent, or custom levy) to allocate payments accurately.
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

      <div>
        <label className="block hig-caption font-semibold mb-1">
          Charge Category
        </label>
        <select
          value={choice}
          onChange={(e) => handleChoiceChange(e.target.value as CycleCategoryChoice)}
          className="hig-input w-full"
          aria-label="Obligation charge category"
        >
          <option value="rent-and-levy">Annual Rent &amp; Security Levy</option>
          <option value="rent-only">Annual Rent Only</option>
          <option value="levy-only">Security Levy Only</option>
          {customCategories.map((cat) => (
            <option key={cat.id} value={`custom:${cat.id}`}>
              {cat.label} ({cat.commissionEligible ? 'Commission-eligible' : 'No commission'})
            </option>
          ))}
          <option value="custom-new">Other Custom Charge…</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block hig-caption font-semibold mb-1">
            Year / Cycle
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
            placeholder="e.g. 2025 Security Levy"
            aria-label="Obligation period label"
            className="hig-input w-full"
          />
        </div>
      </div>

      {choice === 'custom-new' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <label className="block hig-caption font-semibold mb-1">
              Custom Category Name
            </label>
            <input
              type="text"
              value={customCategoryLabel}
              onChange={(e) => setCustomCategoryLabel(e.target.value)}
              placeholder="e.g. Waste Levy or Service Charge"
              className="hig-input w-full"
            />
          </div>
          <label className="flex items-center gap-2 min-h-[40px] text-[0.8125rem] text-[var(--ink-primary)] cursor-pointer sm:pt-5">
            <input
              type="checkbox"
              checked={customCommissionEligible}
              onChange={(e) => setCustomCommissionEligible(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span>Apply lawyer commission ({state.settings.lawyerCommissionRatePercent}%)</span>
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(choice === 'rent-and-levy' || choice === 'rent-only') && (
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
        )}

        {(choice === 'rent-and-levy' || choice === 'levy-only') && (
          <div>
            <label className="block hig-caption font-semibold mb-1">
              Security Levy (₦)
            </label>
            <CurrencyInput
              min={0}
              value={levyAmountStr}
              onValueChange={(raw) => setLevyAmountStr(raw)}
              placeholder="e.g. 4,000"
              className="hig-input w-full"
            />
          </div>
        )}

        {(choice === 'custom-new' || choice.startsWith('custom:')) && (
          <div>
            <label className="block hig-caption font-semibold mb-1">
              Charge Amount (₦)
            </label>
            <CurrencyInput
              min={0}
              value={customAmountStr}
              onValueChange={(raw) => setCustomAmountStr(raw)}
              placeholder="e.g. 10,000"
              className="hig-input w-full"
            />
          </div>
        )}

        <div>
          <label className="block hig-caption font-semibold mb-1">
            Due Date
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
