import { Suspense } from "react";
import Link from "next/link";
import { OrdersView } from "./OrdersView";

export default function OrdersPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Orders
          </div>
          <h1>My orders</h1>
        </div>
      </div>
      <div className="container" style={{ margin: "28px auto 60px" }}>
        <Suspense>
          <OrdersView />
        </Suspense>
      </div>
    </>
  );
}
