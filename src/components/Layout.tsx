import React, { useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Bell,
  Building2,
  FileCheck2,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Moon,
  Plus,
  Scale,
  Settings,
  Sun,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { useRentalStore, type NavTab } from '../context/RentalStore';
import { useTheme } from '../context/ThemeContext';

interface NavItem {
  id: NavTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: 'danger' | 'warning' | 'neutral';
}

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    state,
    activeTab,
    setActiveTab,
    summaryMetrics,
    dueScheduledNotifications,
    setOpenRecordPaymentModal,
    setPreselectedTenantForPayment,
  } = useRentalStore();

  const { resolvedTheme, toggleTheme, textScale, setTextScale } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const failedNotificationsCount = state.notifications.filter(
    (n) => n.status === 'Failed' || n.status === 'Exhausted / Action Required'
  ).length;
  const attentionNotificationsCount = failedNotificationsCount + dueScheduledNotifications.length;
  const managerInitials =
    state.property.managerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'PM';

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
    { id: 'units-tenants', label: 'Units & Tenants', shortLabel: 'Tenants', icon: Building2 },
    { id: 'payments', label: 'Payments', shortLabel: 'Payments', icon: Banknote },
    {
      id: 'arrears-promises',
      label: 'Arrears & Promises',
      shortLabel: 'Arrears',
      icon: AlertTriangle,
      badge: summaryMetrics.overdueTenantCount > 0 ? summaryMetrics.overdueTenantCount : undefined,
      badgeTone: 'danger',
    },
    {
      id: 'receipts',
      label: 'Receipt Queue',
      shortLabel: 'Receipts',
      icon: FileCheck2,
      badge: summaryMetrics.pendingReceiptCount > 0 ? summaryMetrics.pendingReceiptCount : undefined,
      badgeTone: summaryMetrics.overdueReceiptCount > 0 ? 'danger' : 'warning',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      shortLabel: 'Alerts',
      icon: Bell,
      badge: attentionNotificationsCount > 0 ? attentionNotificationsCount : undefined,
      badgeTone: failedNotificationsCount > 0 ? 'danger' : 'warning',
    },
    { id: 'sms-activity', label: 'SMS Activity Log', shortLabel: 'SMS Log', icon: MessageSquareText },
    { id: 'commissions', label: 'Lawyer Commission', shortLabel: 'Lawyer', icon: Scale },
    { id: 'expenses', label: 'Expenses & Repairs', shortLabel: 'Expenses', icon: Wrench },
    { id: 'import', label: 'Data Import', shortLabel: 'Import', icon: Upload },
    { id: 'settings', label: 'Settings & Audit', shortLabel: 'Settings', icon: Settings },
  ];

  const primaryBottomTabs: NavItem[] = [
    navItems[0], // Overview
    navItems[1], // Units & Tenants
    navItems[3], // Arrears & Promises
    navItems[6], // SMS Activity Log
  ];

  const currentNav = navItems.find((n) => n.id === activeTab) || navItems[0];
  const isMoreTabActive = !primaryBottomTabs.some((t) => t.id === activeTab);

  const handleSelectNav = (id: NavTab) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  const handleOpenQuickPayment = () => {
    setPreselectedTenantForPayment(null);
    setOpenRecordPaymentModal(true);
  };

  const sidebarContent = (
    <div
      className="flex flex-col h-full backdrop-blur-2xl border-r"
      style={{
        backgroundColor: 'var(--bg-glass-sidebar)',
        borderColor: 'var(--border-hairline)',
      }}
    >
      <div
        className="px-5 pt-5 pb-4 border-b flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <div className="min-w-0">
          <h1 className="hig-headline text-[var(--ink-primary)] tracking-[-0.02em]">PropLedger</h1>
          <p className="hig-caption mt-0.5 truncate">{state.property.name}</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden hig-touch-icon"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNav(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl text-[0.875rem] font-medium transition-all duration-200 ease-out active:scale-[0.985] ${
                isActive
                  ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[var(--border-hairline)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-hover)] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                    isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--ink-tertiary)]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span
                  className="ml-2 px-2 py-0.5 text-[0.75rem] font-mono-nums font-semibold rounded-md shrink-0"
                  style={{
                    backgroundColor:
                      item.badgeTone === 'danger'
                        ? 'var(--status-danger-bg)'
                        : item.badgeTone === 'warning'
                        ? 'var(--status-warning-bg)'
                        : 'var(--status-neutral-bg)',
                    color:
                      item.badgeTone === 'danger'
                        ? 'var(--status-danger-ink)'
                        : item.badgeTone === 'warning'
                        ? 'var(--status-warning-ink)'
                        : 'var(--status-neutral-ink)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile Drawer Quick Display Settings */}
      <div
        className="lg:hidden px-4 py-3 border-t space-y-2.5"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="hig-caption">Text Size</span>
          <div className="hig-segmented" role="group" aria-label="Text size">
            {(['standard', 'large', 'xlarge'] as const).map((scale) => (
              <button
                key={scale}
                type="button"
                data-active={textScale === scale}
                onClick={() => setTextScale(scale)}
                className="hig-segmented-item !min-h-[36px] !px-2.5 !text-[0.75rem]"
              >
                {scale === 'standard' ? 'A' : scale === 'large' ? 'A+' : 'A++'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manager Profile & Appearance Footer */}
      <div
        className="p-3.5 border-t flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[0.75rem] font-semibold shrink-0">
            {managerInitials}
          </div>
          <div className="min-w-0">
            <p className="text-[0.875rem] font-semibold text-[var(--ink-primary)] truncate">
              {state.property.managerName}
            </p>
            <p className="text-[0.75rem] font-medium text-[var(--ink-tertiary)] truncate">
              Property Manager · Admin
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="hig-touch-icon shrink-0"
          aria-label={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)] flex overflow-x-hidden">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile / Tablet Slide-Over All-Destinations Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/35 backdrop-blur-[4px] transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative w-[290px] max-w-[85vw] h-full z-10"
            style={{ boxShadow: 'var(--shadow-sheet)' }}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Workspace Canvas */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Frosted Top Navigation Bar (52px mobile / 64px desktop) */}
        <header
          className="sticky top-0 z-30 h-[52px] lg:h-16 backdrop-blur-xl border-b px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-glass)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden hig-touch-icon -ml-1.5"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:inline text-[0.875rem] font-medium text-[var(--ink-tertiary)] whitespace-nowrap">
                {state.property.name}
              </span>
              <span
                className="hidden sm:inline text-[var(--ink-tertiary)] opacity-45"
                aria-hidden="true"
              >
                /
              </span>
              <h2 className="text-[1rem] sm:text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--ink-primary)] truncate">
                {currentNav.label}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {state.settings.globalNotificationsPaused && (
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="hidden md:inline-flex items-center min-h-[44px] px-3 rounded-xl text-[0.8125rem] font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-85"
                style={{
                  backgroundColor: 'var(--status-warning-bg)',
                  color: 'var(--status-warning-ink)',
                }}
              >
                Notifications Paused
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="hig-touch-icon"
              aria-label={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenQuickPayment}
              className="hig-btn-primary !px-3 sm:!px-4 whitespace-nowrap shrink-0"
              aria-label="Record Payment"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline sm:inline">Record Payment</span>
              <span className="xs:hidden sm:hidden">Pay</span>
            </button>
          </div>
        </header>

        {/* Breathable Content Container with bottom tab bar clearance */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pt-5 pb-24 lg:py-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Apple HIG Fixed Mobile Bottom Tab Bar (< 1024px) */}
      <nav
        aria-label="Quick mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-2xl pb-safe"
        style={{
          backgroundColor: 'var(--bg-glass)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="grid grid-cols-5 items-center h-[54px] max-w-xl mx-auto px-1">
          {primaryBottomTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition-colors duration-200 active:scale-95 ${
                  isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--ink-tertiary)]'
                }`}
              >
                <span className="relative inline-flex items-center justify-center">
                  <Icon className="w-[20px] h-[20px]" />
                  {item.badge !== undefined && (
                    <span
                      className="absolute -top-1.5 -right-3.5 min-w-[17px] h-[17px] px-1 rounded-full text-[0.625rem] font-mono-nums font-bold flex items-center justify-center leading-none ring-2 ring-[var(--bg-surface)]"
                      style={{
                        backgroundColor: 'var(--status-danger-ink)',
                        color: '#FFFFFF',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="text-[0.6875rem] font-medium tracking-[-0.01em] truncate max-w-full">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="More views and display settings"
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition-colors duration-200 active:scale-95 ${
              isMoreTabActive ? 'text-[var(--accent-ink)]' : 'text-[var(--ink-tertiary)]'
            }`}
          >
            <Menu className="w-[20px] h-[20px]" />
            <span className="text-[0.6875rem] font-medium tracking-[-0.01em]">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
