import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  caretOffsetForSignificantCount,
  countSignificantCurrencyChars,
  formatAccountingDisplay,
  parseCurrencyValue,
  sanitizeCurrencyInput,
} from '../utils/format';

export interface CurrencyInputProps {
  id?: string;
  name?: string;
  value: string | number;
  onValueChange: (rawNumericString: string, numericValue: number) => void;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  showPrefix?: boolean;
}

export function CurrencyInput({
  id,
  name,
  value,
  onValueChange,
  min,
  max,
  required,
  disabled,
  readOnly,
  placeholder,
  ariaLabel,
  className = '',
  showPrefix = true,
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretSigCountRef = useRef<number | null>(null);
  const [draftRaw, setDraftRaw] = useState<string>(() =>
    value === '' || value === null || value === undefined ? '' : sanitizeCurrencyInput(String(value))
  );

  // Sync draftRaw when parent value changes externally (e.g., modal prefill, tenant switch, auto-allocate)
  useEffect(() => {
    const extRaw =
      value === '' || value === null || value === undefined ? '' : sanitizeCurrencyInput(String(value));
    if (extRaw === '') {
      if (draftRaw !== '') {
        setDraftRaw('');
      }
      return;
    }
    const extNum = parseCurrencyValue(extRaw);
    const curNum = parseCurrencyValue(draftRaw);
    // Keep trailing decimal typing intact when numeric values match
    if (draftRaw === '' || extNum !== curNum) {
      setDraftRaw(extRaw);
    }
  }, [value]);

  const displayValue = formatAccountingDisplay(draftRaw);

  // Restore caret position after formatting inserts/removes commas
  useLayoutEffect(() => {
    const targetSig = pendingCaretSigCountRef.current;
    if (targetSig === null || !inputRef.current) return;
    pendingCaretSigCountRef.current = null;
    if (document.activeElement === inputRef.current) {
      const nextOffset = caretOffsetForSignificantCount(displayValue, targetSig);
      inputRef.current.setSelectionRange(nextOffset, nextOffset);
    }
  }, [displayValue]);

  // Keep native HTML5 min/max constraint validity synchronized
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!draftRaw) {
      el.setCustomValidity('');
      return;
    }
    const num = parseCurrencyValue(draftRaw);
    if (min !== undefined && num < min) {
      el.setCustomValidity(`Value must be at least ${formatAccountingDisplay(min)}`);
    } else if (max !== undefined && num > max) {
      el.setCustomValidity(`Value must be no more than ${formatAccountingDisplay(max)}`);
    } else {
      el.setCustomValidity('');
    }
  }, [draftRaw, min, max]);

  const applyRawChange = (nextTypedText: string, sigCharsBeforeCaret: number | null) => {
    let sanitized = sanitizeCurrencyInput(nextTypedText);
    let num = parseCurrencyValue(sanitized);

    if (max !== undefined && sanitized !== '' && num > max) {
      sanitized = sanitizeCurrencyInput(String(max));
      num = max;
    }

    pendingCaretSigCountRef.current = sigCharsBeforeCaret;
    setDraftRaw(sanitized);
    onValueChange(sanitized, num);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    const caret = e.target.selectionStart ?? rawInput.length;
    const sigCount = countSignificantCurrencyChars(rawInput.slice(0, caret));
    applyRawChange(rawInput, sigCount);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Backspace' &&
      inputRef.current &&
      inputRef.current.selectionStart !== null &&
      inputRef.current.selectionStart === inputRef.current.selectionEnd
    ) {
      const pos = inputRef.current.selectionStart;
      if (pos > 1 && displayValue[pos - 1] === ',') {
        e.preventDefault();
        const withoutPrecedingDigit = displayValue.slice(0, pos - 2) + displayValue.slice(pos - 1);
        const sigBefore = countSignificantCurrencyChars(displayValue.slice(0, pos - 2));
        applyRawChange(withoutPrecedingDigit, sigBefore);
      }
    }
  };

  const handleBlur = () => {
    if (draftRaw.endsWith('.')) {
      const trimmed = draftRaw.slice(0, -1);
      setDraftRaw(trimmed);
      onValueChange(trimmed, parseCurrencyValue(trimmed));
    }
  };

  return (
    <div className="relative flex items-center">
      {showPrefix && (
        <span
          aria-hidden="true"
          className="absolute left-3.5 text-[0.875rem] font-mono-nums font-medium text-[var(--ink-tertiary)] pointer-events-none select-none"
        >
          ₦
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`hig-input w-full ${showPrefix ? '!pl-8' : '!pl-3.5'} text-right font-mono-nums ${className}`}
      />
    </div>
  );
}
