import React from 'react';
import { ArrearsPromisesView } from './components/ArrearsPromisesView';
import { CalendarSyncModal } from './components/CalendarSyncModal';
import { CommissionsView } from './components/CommissionsView';
import { CustomMessageComposerModal } from './components/CustomMessageComposerModal';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExpensesMaintenanceView } from './components/ExpensesMaintenanceView';
import { ImportView } from './components/ImportView';
import { Layout } from './components/Layout';
import { NotificationsView } from './components/NotificationsView';
import { PaymentsView } from './components/PaymentsView';
import { ReceiptsView } from './components/ReceiptsView';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { SettingsAuditView } from './components/SettingsAuditView';
import { SmsActivityLogView } from './components/SmsActivityLogView';
import { TenantInspectorDrawer } from './components/TenantInspectorDrawer';
import { UnitsTenantsView } from './components/UnitsTenantsView';
import { IntegrationProvider } from './context/IntegrationContext';
import { RentalProvider, useRentalStore } from './context/RentalStore';
import { ThemeProvider } from './context/ThemeContext';

function ActiveScreen() {
  const { activeTab } = useRentalStore();

  switch (activeTab) {
    case 'overview':
      return <DashboardView />;
    case 'units-tenants':
      return <UnitsTenantsView />;
    case 'payments':
      return <PaymentsView />;
    case 'arrears-promises':
      return <ArrearsPromisesView />;
    case 'receipts':
      return <ReceiptsView />;
    case 'notifications':
      return <NotificationsView />;
    case 'sms-activity':
      return <SmsActivityLogView />;
    case 'commissions':
      return <CommissionsView />;
    case 'expenses':
      return <ExpensesMaintenanceView />;
    case 'import':
      return <ImportView />;
    case 'settings':
      return <SettingsAuditView />;
    default:
      return <DashboardView />;
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <IntegrationProvider>
          <RentalProvider>
            <Layout>
              <ActiveScreen />
            </Layout>
            <RecordPaymentModal />
            <TenantInspectorDrawer />
            <CustomMessageComposerModal />
            <CalendarSyncModal />
          </RentalProvider>
        </IntegrationProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
