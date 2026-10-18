import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms and conditions — The Market Place" };

export default function TermsPage() {
  return (
    <Legal title="Terms and conditions">
      <p>
        These terms cover use of The Market Place, including the website and the Android and iPhone apps when those are
        offered. By creating an account, listing a product, or paying for an order, you agree to them. The{" "}
        <Link href="/privacy">Privacy</Link> page explains what information the marketplace stores.
      </p>

      <h2>The marketplace</h2>
      <p>
        The Market Place lets people list products and buy them from each other. A seller sets the name, photos,
        description, price in USDC, and quantity. A buyer pays from a Stellar wallet. The marketplace records the
        order. It does not take ownership of the product.
      </p>
      <p>
        Payments that are available today are USDC on the Stellar network, either sent directly to the seller or held
        in a Soroban escrow contract until delivery is confirmed. Card checkout is not available yet. When it is added,
        these terms will be updated before you can use it.
      </p>

      <h2>Accounts</h2>
      <p>
        You need an account to list a product and to pay. You must give a name, an email address you can access, and a
        password of at least 8 characters. You are responsible for keeping that password private and for activity on
        your account.
      </p>
      <p>
        To receive or send USDC you also connect a Stellar wallet, such as Freighter. You control that wallet. The
        marketplace cannot recover a lost secret key or reverse a Stellar transaction once the network has confirmed
        it.
      </p>

      <h2>Listings</h2>
      <ul>
        <li>You may list only products you have the right to sell.</li>
        <li>The description, photos, price, and quantity must match what the buyer will receive.</li>
        <li>You must be able to receive USDC at the wallet you connect.</li>
        <li>You can remove your own listing. Removing it does not cancel an order that is already paid.</li>
        <li>Listings marked Demo are samples. They cannot be purchased.</li>
      </ul>

      <h2>Orders and delivery</h2>
      <p>
        Placing an order reserves the quantity. If the payment is not confirmed, the reservation ends and the quantity
        goes back on sale. After payment is verified on Stellar, the seller ships or delivers the product and can add
        a tracking note. The buyer confirms delivery.
      </p>
      <p>
        With a direct payment, USDC is already in the seller’s wallet. Confirming delivery only updates the order. With
        escrow, USDC stays in the contract until the buyer confirms delivery, the seller refunds it, the seller claims
        it after the release date if nobody opened a dispute, or an arbiter splits a dispute.
      </p>

      <h2>Disputes</h2>
      <p>
        Either the buyer or the seller can open a dispute on an escrow order before it is released. That freezes the
        funds. The marketplace arbiter can then send all or part of the USDC to the buyer, the seller, or both. Direct
        payments cannot be pulled back by the marketplace.
      </p>

      <h2>Acceptable use</h2>
      <p>You may not use The Market Place to list or buy anything illegal, to mislead another person, or to interfere with the site, the apps, or the Stellar network. We may remove a listing or close an account that breaks these terms.</p>

      <h2>Availability</h2>
      <p>
        Stellar, wallet software, and this website can be interrupted. A failed or delayed transaction is not a
        completed order until the marketplace has verified it. Network fees are paid to Stellar, not to The Market
        Place.
      </p>
    </Legal>
  );
}
