import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { testConnection } from '../lib/firebase';
import {
  clearCachedGmailToken,
  getCurrentGmailUser,
  gmailSignIn,
  gmailSignOut,
  initGmailAuth,
} from '../utils/gmailAuth';
import {
  fetchIntegrationStatus,
  type ServerIntegrationStatus,
} from '../utils/emailClient';

interface IntegrationContextValue {
  status: ServerIntegrationStatus | null;
  statusLoading: boolean;
  refreshStatus: () => Promise<void>;
  authReady: boolean;
  gmailUser: User | null;
  gmailAccessToken: string | null;
  isGmailConnected: boolean;
  isGmailSigningIn: boolean;
  gmailError: string;
  connectGmail: () => Promise<{ user: User; accessToken: string } | null>;
  disconnectGmail: () => Promise<void>;
  clearGmailSessionToken: () => void;
}

const IntegrationContext = createContext<IntegrationContextValue | null>(null);

export function IntegrationProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ServerIntegrationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [gmailUser, setGmailUser] = useState<User | null>(() => getCurrentGmailUser());
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);
  const [isGmailSigningIn, setIsGmailSigningIn] = useState(false);
  const [gmailError, setGmailError] = useState('');

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const next = await fetchIntegrationStatus();
      setStatus(next);
    } catch {
      // Leave null if backend endpoint is temporarily unreachable
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void testConnection();
  }, [refreshStatus]);

  useEffect(() => {
    const unsub = initGmailAuth((user, token) => {
      setGmailUser(user);
      setGmailAccessToken(token);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const connectGmail = useCallback(async () => {
    setIsGmailSigningIn(true);
    setGmailError('');
    try {
      const res = await gmailSignIn();
      setGmailUser(res.user);
      setGmailAccessToken(res.accessToken);
      setAuthReady(true);
      return res;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to complete Google Sign-In.';
      setGmailError(msg);
      return null;
    } finally {
      setIsGmailSigningIn(false);
    }
  }, []);

  const disconnectGmail = useCallback(async () => {
    setGmailError('');
    await gmailSignOut();
    setGmailUser(null);
    setGmailAccessToken(null);
  }, []);

  const clearGmailSessionToken = useCallback(() => {
    clearCachedGmailToken();
    setGmailAccessToken(null);
  }, []);

  return (
    <IntegrationContext.Provider
      value={{
        status,
        statusLoading,
        refreshStatus,
        authReady,
        gmailUser,
        gmailAccessToken,
        isGmailConnected: Boolean(gmailAccessToken),
        isGmailSigningIn,
        gmailError,
        connectGmail,
        disconnectGmail,
        clearGmailSessionToken,
      }}
    >
      {children}
    </IntegrationContext.Provider>
  );
}

export function useIntegrations(): IntegrationContextValue {
  const ctx = useContext(IntegrationContext);
  if (!ctx) throw new Error('useIntegrations must be used inside IntegrationProvider');
  return ctx;
}
