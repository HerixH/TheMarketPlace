"use client";

import { useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { api } from "@/lib/client/api";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import type { Account } from "@/lib/types";

export type SettingsPanel = "profile" | "password";

export function ProfileSettings({ account, panel, onClose }: { account: Account; panel: SettingsPanel; onClose: () => void }) {
  return panel === "profile" ? (
    <EditProfile account={account} onClose={onClose} />
  ) : (
    <ChangePassword onClose={onClose} />
  );
}

function EditProfile({ account, onClose }: { account: Account; onClose: () => void }) {
  const { refresh } = useAccount();
  const [name, setName] = useState(account.name);
  const [address, setAddress] = useState(account.address ?? "");
  const [city, setCity] = useState(account.city ?? "");
  const [country, setCountry] = useState(account.country ?? DEFAULT_COUNTRY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api<Account>("/api/auth/profile", { method: "POST", json: { name, address, city, country } });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={save}>
      <div className="profile-form-head">
        <h3>Edit profile</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="field">
        <label htmlFor="pf-name">Full name</label>
        <input id="pf-name" className="input" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pf-email">Email</label>
        <input id="pf-email" className="input" value={account.email} disabled />
      </div>
      <div className="field">
        <label htmlFor="pf-address">Address</label>
        <textarea
          id="pf-address"
          className="textarea"
          rows={2}
          maxLength={200}
          placeholder="House number, street, area"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="pf-city">City or town</label>
          <input id="pf-city" className="input" maxLength={60} placeholder="Lusaka" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pf-country">Country</label>
          <select id="pf-country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Profile saved.</div>}
      <div className="profile-form-actions">
        <button className="btn btn-sm" disabled={busy}>
          {busy && <span className="spinner" />} Save profile
        </button>
      </div>
    </form>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 8) return setError("New password must be at least 8 characters");
    if (next !== confirm) return setError("The new passwords do not match");
    setBusy(true);
    try {
      await api("/api/auth/password", { method: "POST", json: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password");
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <form className="profile-form" onSubmit={save}>
      <div className="profile-form-head">
        <h3>Change password</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="field">
        <label htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="input" type={type} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="pw-new">New password</label>
          <input id="pw-new" className="input" type={type} autoComplete="new-password" required minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" className="input" type={type} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      <label className="profile-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
      </label>
      <p className="muted profile-hint">At least 8 characters. Other devices signed in to this account will be signed out.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {done && <div className="alert alert-success">Password changed. Other devices have been signed out.</div>}
      <div className="profile-form-actions">
        <button className="btn btn-sm" disabled={busy}>
          {busy && <span className="spinner" />} Change password
        </button>
      </div>
    </form>
  );
}
