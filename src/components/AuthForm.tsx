"use client";

import Link from "next/link";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / {title}
          </div>
          <h1>{title}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="container" style={{ margin: "28px auto 60px" }}>
        {children}
      </div>
    </>
  );
}

export function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
