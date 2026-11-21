import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import { exportFilteredCsv } from '../utils/csvExport';
import { downloadTextFile, formatNaira } from '../utils/format';
import {
  parseCsvText,
  validatePaymentCsvRows,
  validateTenancyCsvRows,
  type CsvImportRowResult,
  type ParsedPaymentImportRow,
  type ParsedTenancyRow,
} from '../utils/rentalEngine';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

const TENANCY_TEMPLATE = `unitCode,unitName,unitType,floorOrWing,firstName,lastName,alias,phone,email,agreedRent,securityLevy,startDate,endDate,dueDate
B-203,Suite B3 (Bedroom),Bedroom,Second Floor,Ngozi,Okafor,Mama Ngozi,+234 803 551 2290,ngozi.okafor@example.ng,1350000,4000,2026-11-01,2027-10-31,2026-11-01
Container-06,Container 06 (Alagbada),Container Shop,Frontage,Tunde,Balogun,Baba T,+234 805 112 9044,tunde.balogun@example.ng,95000,4000,2026-11-10,2027-11-09,2026-11-10`;

const MESSY_SPREADSHEET_SAMPLE = `Tenant Name,Unit Number,Unit Type,Agreed Amount per cycle,Rent cycle Owed,Amount Owed,Security Levy (4k)
Mrs Lawal,Shop 03,Shop,200000,Paying to Aisha,0,4000
Sheikh Ibrahim Alfalaky,R&P-3,Room & Parlour,85000,2 years (2025 & 2026),170000,8000
Adebowale,Container-05,Container Shop,80000,Onboarding 1 year,80000,4000`;

const PAYMENT_TEMPLATE = `unitCode,tenantName,amount,dateReceived,method,bankReference,notes
S-02,Mrs Lawal,200000,2026-11-15,Bank Transfer,ZNT-HIST-9901,Historical Nov tranche
K-01,Mrs Alimi,100000,2026-11-14,Cash,,Historical rent settlement`;

export function ImportView() {
  const { state, commitTenancyImport, commitPaymentImport } = useRentalStore();

  const [importType, setImportType] = useState<'tenancies' | 'payments'>('tenancies');
  const [csvText, setCsvText] = useState<string>('');
  const [filename, setFilename] = useState<string>('manual-paste.csv');
  const [backfillReceipts, setBackfillReceipts] = useState(false);

  const [tenancyPreview, setTenancyPreview] = useState<CsvImportRowResult<ParsedTenancyRow>[] | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<CsvImportRowResult<ParsedPaymentImportRow>[] | null>(null);
  const [importSummary, setImportSummary] = useState<string>('');
  const [search, setSearch] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      setCsvText(text);
      runValidation(text);
    };
    reader.readAsText(file);
  };

  const runValidation = (raw = csvText) => {
    setImportSummary('');
    const { rows } = parseCsvText(raw);
    if (importType === 'tenancies') {
      setPaymentPreview(null);
      setTenancyPreview(validateTenancyCsvRows(rows, state.units, state.tenants));
    } else {
      setTenancyPreview(null);
      setPaymentPreview(validatePaymentCsvRows(rows, state.units, state.payments));
    }
  };

  const handleLoadSample = () => {
    const sample =
      importType === 'tenancies'
        ? `${TENANCY_TEMPLATE}\nBAD-ROW,Invalid Sample,Castle,Annex,NoLast,,+234,,,-100,2026-11-01,bad-date,2026-11-01`
        : `${PAYMENT_TEMPLATE}\nMISSING-U,Unknown Tenant,250000,2026-11-10,Bank Transfer,REF-1,Missing unit check`;
    setCsvText(sample);
    setFilename(`sample_${importType}.csv`);
    runValidation(sample);
  };

  const handleLoadMessyCleanupSample = () => {
    setImportType('tenancies');
    setCsvText(MESSY_SPREADSHEET_SAMPLE);
    setFilename('agbasaffy_messy_sheet_sample.csv');
    setImportSummary('');
    setPaymentPreview(null);
    const { rows } = parseCsvText(MESSY_SPREADSHEET_SAMPLE);
    setTenancyPreview(validateTenancyCsvRows(rows, state.units, state.tenants));
  };

  const handleCommit = () => {
    if (importType === 'tenancies' && tenancyPreview) {
      const validRows = tenancyPreview
        .filter((r) => (r.status === 'Valid' || r.status === 'Warning') && r.parsed)
        .map((r) => r.parsed!);
      const rejectedCount = tenancyPreview.filter((r) => r.status === 'Error').length;
      const res = commitTenancyImport(validRows, filename);
      setImportSummary(
        `Committed ${validRows.length} row(s) (${rejectedCount} invalid rows skipped): +${res.unitsCreated} units, +${res.tenantsCreated} tenants, +${res.agreementsCreated} agreements. External notifications were suppressed.`
      );
      setTenancyPreview(null);
    } else if (importType === 'payments' && paymentPreview) {
      const validRows = paymentPreview
        .filter((r) => (r.status === 'Valid' || r.status === 'Warning') && r.parsed)
        .map((r) => r.parsed!);
      const rejectedCount = paymentPreview.filter((r) => r.status === 'Error').length;
      const res = commitPaymentImport(validRows, filename, backfillReceipts);
      setImportSummary(
        `Committed ${res.paymentsImported} historical payment(s) totaling ${formatNaira(res.totalAmount)} (${rejectedCount + res.skippedUnmatched} skipped). Balances and commissions recalculated.`
      );
      setPaymentPreview(null);
    }
  };

  const activePreview = importType === 'tenancies' ? tenancyPreview : paymentPreview;
  const filteredPreview = useMemo(() => {
    if (!activePreview) return null;
    const q = search.trim().toLowerCase();
    if (!q) return activePreview;
    return activePreview.filter((row) => {
      const searchable = `#${row.rowNumber} ${row.status} ${Object.values(row.raw).join(' ')} ${row.messages.join(' ')}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [activePreview, search]);

  const validCount = activePreview ? activePreview.filter((r) => r.status === 'Valid').length : 0;
  const warningCount = activePreview ? activePreview.filter((r) => r.status === 'Warning').length : 0;
  const errorCount = activePreview ? activePreview.filter((r) => r.status === 'Error').length : 0;

  const handleExportPreviewCsv = () => {
    if (!filteredPreview || filteredPreview.length === 0) return;
    exportFilteredCsv(
      `propledger-import-preview-${importType}-${state.referenceDate}.csv`,
      ['Row Number', 'Validation Status', 'Unit Code', 'Tenant Name', 'Source Summary', 'Validation Notes'],
      filteredPreview.map((row) => {
        const unitCode = row.raw.unitCode || '';
        const tenantName =
          row.raw.tenantName ||
          [row.raw.firstName, row.raw.lastName, row.raw.alias ? `(${row.raw.alias})` : '']
            .filter(Boolean)
            .join(' ');
        return [
          row.rowNumber,
          row.status,
          unitCode,
          tenantName,
          Object.values(row.raw).filter(Boolean).join(' · '),
          row.messages.join('; '),
        ];
      })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Historical Data CSV Import</h1>
          <p className="hig-callout mt-1">
            Onboard existing Excel/CSV units, tenants, agreements, and historical payments with pre-commit validation and reconciliation.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            downloadTextFile(
              importType === 'tenancies' ? 'propledger_tenancy_template.csv' : 'propledger_payments_template.csv',
              importType === 'tenancies' ? TENANCY_TEMPLATE : PAYMENT_TEMPLATE
            )
          }
          className="hig-btn-secondary whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Download CSV Template</span>
        </button>
      </div>

      {importSummary && (
        <div
          className="p-4 rounded-2xl text-[0.875rem] flex items-center gap-2.5 border"
          style={{
            backgroundColor: 'var(--status-success-bg)',
            borderColor: 'color-mix(in srgb, var(--status-success-ink) 25%, transparent)',
            color: 'var(--status-success-ink)',
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{importSummary}</span>
        </div>
      )}

      {/* Import Type Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hig-segmented w-full sm:w-fit" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={importType === 'tenancies'}
            data-active={importType === 'tenancies'}
            onClick={() => {
              setImportType('tenancies');
              setTenancyPreview(null);
              setPaymentPreview(null);
            }}
            className="hig-segmented-item flex-1 sm:flex-initial"
          >
            Units, Tenants & Agreements
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={importType === 'payments'}
            data-active={importType === 'payments'}
            onClick={() => {
              setImportType('payments');
              setTenancyPreview(null);
              setPaymentPreview(null);
            }}
            className="hig-segmented-item flex-1 sm:flex-initial"
          >
            Historical Payments
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search unit number, tenant name, or notes..."
            ariaLabel="Search CSV preview rows by unit number, tenant name, or validation notes"
            className="w-full sm:w-64"
          />
          <ExportCsvButton
            onClick={handleExportPreviewCsv}
            disabled={!filteredPreview || filteredPreview.length === 0}
            count={filteredPreview ? filteredPreview.length : 0}
            label="Export Preview CSV"
          />
          <button
            type="button"
            onClick={handleLoadSample}
            className="hig-btn-secondary"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Load Sample CSV</span>
          </button>
          <button
            type="button"
            onClick={handleLoadMessyCleanupSample}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[0.875rem] font-medium border transition-colors"
            style={{
              backgroundColor: 'var(--status-warning-bg)',
              borderColor: 'color-mix(in srgb, var(--status-warning-ink) 28%, transparent)',
              color: 'var(--status-warning-ink)',
            }}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Load Messy Sheet Cleanup Sample</span>
          </button>
        </div>
      </div>

      {/* Upload / Paste Area */}
      <div className="hig-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="hig-btn-secondary cursor-pointer w-fit">
            <Upload className="w-4 h-4" />
            <span>Upload .CSV File</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="sr-only" />
          </label>
          <span className="hig-footnote">
            Active file: <strong className="font-semibold text-[var(--ink-primary)]">{filename}</strong>
          </span>
        </div>

        <textarea
          rows={6}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="Or paste CSV content here with header row..."
          aria-label="CSV content input"
          className="hig-input w-full min-h-[140px] font-mono-nums"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {importType === 'payments' ? (
            <label className="flex items-center gap-2.5 min-h-[44px] hig-subhead cursor-pointer">
              <input
                type="checkbox"
                checked={backfillReceipts}
                onChange={(e) => setBackfillReceipts(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span>Create backfill receipt requests for imported payments (disabled by default)</span>
            </label>
          ) : (
            <span className="hig-footnote">
              Supports Room, Bedroom, Room &amp; Parlour, Shop, Kiosk, Container Shop, optional alias, phone/email, and spreadsheet columns (Tenant Name, Unit Number, Agreed Amount per cycle, Rent cycle Owed, Security Levy).
            </span>
          )}

          <button
            type="button"
            onClick={() => runValidation()}
            disabled={!csvText.trim()}
            className="hig-btn-primary"
          >
            Validate & Preview Rows
          </button>
        </div>
      </div>

      {/* Validation Preview Table */}
      {filteredPreview && (
        <div className="hig-card overflow-hidden">
          <div
            className="px-4 sm:px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4"
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <div className="flex items-center gap-4 text-[0.875rem] flex-wrap">
              <span className="font-semibold text-[var(--ink-primary)]">
                Validation Preview ({filteredPreview.length} of {activePreview?.length ?? 0})
              </span>
              <span className="font-medium" style={{ color: 'var(--status-success-ink)' }}>
                {validCount} Valid
              </span>
              <span className="font-medium" style={{ color: 'var(--status-warning-ink)' }}>
                {warningCount} Warning
              </span>
              <span className="font-medium" style={{ color: 'var(--status-danger-ink)' }}>
                {errorCount} Rejected
              </span>
            </div>

            <button
              type="button"
              onClick={handleCommit}
              disabled={validCount + warningCount === 0}
              className="hig-btn-primary"
              style={{ backgroundColor: 'var(--status-success-ink)', color: '#FFFFFF' }}
            >
              Commit {validCount + warningCount} Eligible Row(s)
            </button>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredPreview.length === 0 ? (
              <p className="py-8 px-4 text-center hig-subhead">
                No preview rows match your filter.
              </p>
            ) : (
              filteredPreview.map((row) => (
                <div key={row.rowNumber} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="hig-footnote font-mono-nums">Row #{row.rowNumber}</span>
                    <StatusBadge label={row.status} />
                  </div>
                  <p className="font-mono-nums text-[0.8125rem] text-[var(--ink-primary)] break-words">
                    {Object.values(row.raw).filter(Boolean).slice(0, 5).join(' · ')}
                  </p>
                  {row.messages.length > 0 && (
                    <p className="hig-footnote">{row.messages.join('; ')}</p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                  style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
                >
                  <th className="py-3 px-5">Row</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Source Summary</th>
                  <th className="py-3 px-5">Validation Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredPreview.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center hig-subhead">
                      No preview rows match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredPreview.map((row) => (
                    <tr key={row.rowNumber} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3 px-5 font-mono-nums text-[var(--ink-tertiary)]">
                        #{row.rowNumber}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge label={row.status} />
                      </td>
                      <td className="py-3 px-4 font-mono-nums text-[0.8125rem] text-[var(--ink-primary)]">
                        {Object.values(row.raw).filter(Boolean).slice(0, 5).join(' · ')}
                      </td>
                      <td className="py-3 px-5 hig-footnote">
                        {row.messages.join('; ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
