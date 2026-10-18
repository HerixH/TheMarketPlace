"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import type { Account } from "@/lib/types";
import { useWallet } from "./WalletProvider";

interface AccountState {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { disconnect } = useWallet();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ account: Account | null }>("/api/auth/me");
      setAccount(data.account);
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api("/api/auth/signout", { method: "POST" });
    setAccount(null);
    disconnect();
  }, [disconnect]);

  const value = useMemo(() => ({ account, loading, refresh, signOut }), [account, loading, refresh, signOut]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
