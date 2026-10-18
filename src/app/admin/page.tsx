import { Suspense } from "react";
import Link from "next/link";
import { AdminView } from "./AdminView";

export default function AdminPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Admin
          </div>
          <h1>Admin</h1>
        </div>
      </div>
      <div className="container" style={{ margin: "28px auto 60px" }}>
        <Suspense>
          <AdminView />
        </Suspense>
      </div>
    </>
  );
}
