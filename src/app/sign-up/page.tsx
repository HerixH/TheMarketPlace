"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { api } from "@/lib/client/api";
import type { Account } from "@/lib/types";
import { AuthShell, Field } from "@/components/AuthForm";

export default function SignUpPage() {
  const router = useRouter();
  const { refresh } = useAccount();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Account>("/api/auth/signup", { method: "POST", json: { name, email, password } });
      await refresh();
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create an account" subtitle="One account for the website and the Android and iPhone apps.">
      <form className="form" onSubmit={submit}>
        <Field id="name" label="Name" type="text" value={name} onChange={setName} autoComplete="name" />
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <p className="muted" style={{ margin: "-8px 0 0", fontSize: 13 }}>At least 8 characters.</p>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required style={{ marginTop: 3 }} />
          <span>
            I agree to the <Link href="/terms">Terms and conditions</Link> and <Link href="/privacy">Privacy</Link> page.
          </span>
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-lg" disabled={busy || !agreed}>
          {busy && <span className="spinner" />} Create account
        </button>
        <p className="muted">
          Already have an account? <Link href="/sign-in" className="link-pink">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
