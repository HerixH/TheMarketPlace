"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAddress, getNetwork, isConnected, requestAccess } from "@stellar/freighter-api";
import { IS_MAINNET } from "@/lib/config";
import { getWalletBalances, walletError, type WalletBalances } from "@/lib/client/stellar";

interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  wrongNetwork: boolean;
  balances: WalletBalances | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);
const STORAGE_KEY = "themarketplace:wallet";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [balances, setBalances] = useState<WalletBalances | null>(null);

  const checkNetwork = useCallback(async () => {
    const res = await getNetwork();
    if (res.error) return;
    const isMain = res.network?.toUpperCase() === "PUBLIC";
    setWrongNetwork(isMain !== IS_MAINNET);
  }, []);

  // Restore a previous session without prompting the user again.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") return;
    (async () => {
      const conn = await isConnected();
      if (!conn.isConnected) return;
      const res = await getAddress();
      if (res.address) {
        setAddress(res.address);
        checkNetwork();
      }
    })().catch(() => undefined);
  }, [checkNetwork]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const conn = await isConnected();
      if (!conn.isConnected) {
        setError("Freighter wallet not found. Install the Freighter extension and refresh this page.");
        return null;
      }
      const res = await requestAccess();
      if (res.error || !res.address) {
        setError(walletError(res.error) || "Connection was declined");
        return null;
      }
      setAddress(res.address);
      localStorage.setItem(STORAGE_KEY, "1");
      await checkNetwork();
      return res.address;
    } catch (err) {
      setError(walletError(err));
      return null;
    } finally {
      setConnecting(false);
    }
  }, [checkNetwork]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalances(null);
    setError(null);
    setWrongNetwork(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setBalances(null);
      return;
    }
    setBalances(await getWalletBalances(address));
  }, [address]);

  useEffect(() => {
    refreshBalances().catch(() => setBalances(null));
  }, [refreshBalances]);

  const value = useMemo(
    () => ({ address, connecting, error, wrongNetwork, balances, connect, disconnect, refreshBalances }),
    [address, connecting, error, wrongNetwork, balances, connect, disconnect, refreshBalances],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}