import Link from "next/link";
import { CartView } from "./CartView";

export default function CartPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Cart
          </div>
          <h1>Cart</h1>
        </div>
      </div>
      <div className="container" style={{ margin: "28px auto 60px" }}>
        <CartView />
      </div>
    </>
  );
}
