import Link from "next/link";

export function Legal({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / {title}
          </div>
          <h1>{title}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Last updated 8 October 2026
          </p>
        </div>
      </div>
      <div className="container legal">{children}</div>
    </>
  );
}
