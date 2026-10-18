"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { AuthShell, Field } from "@/components/AuthForm";
import { api } from "@/lib/client/api";
import type { Account } from "@/lib/types";

export default function SignInPage() {
  const router = useRouter();
  const { refresh } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Account>("/api/auth/signin", { method: "POST", json: { email, password } });
      await refresh();
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your Market Place account to buy, sell, and track orders.">
      <form className="form" onSubmit={submit}>
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-lg" disabled={busy}>
          {busy && <span className="spinner" />} Sign in
        </button>
        <div className="demo-note" style={{ borderRadius: 10, textAlign: "left" }}>
          Shopper: <b>demo@themarketplace.test</b>
          <br />
          Seller: <b>seller@themarketplace.test</b>
          <br />
          Admin: <b>admin@themarketplace.test</b>
          <br />
          Password for all: <b>marketplace</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                setEmail("demo@themarketplace.test");
                setPassword("marketplace");
              }}
            >
              Use demo account
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                setEmail("seller@themarketplace.test");
                setPassword("marketplace");
              }}
            >
              Use seller account
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                setEmail("admin@themarketplace.test");
                setPassword("marketplace");
              }}
            >
              Use admin account
            </button>
          </div>
        </div>
        <p className="muted">
          New here? <Link href="/sign-up" className="link-pink">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
