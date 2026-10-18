import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy — The Market Place" };

export default function PrivacyPage() {
  return (
    <Legal title="Privacy">
      <p>
        This page describes the information The Market Place stores when you use the website. The same practices will
        apply to the Android and iPhone apps. It sits alongside the <Link href="/terms">Terms and conditions</Link>.
      </p>

      <h2>Account information</h2>
      <p>When you create an account we store:</p>
      <ul>
        <li>Your name</li>
        <li>Your email address</li>
        <li>A scrambled form of your password, not the password itself</li>
        <li>The date the account was created</li>
        <li>The Stellar wallet address you choose to link, if you link one</li>
      </ul>
      <p>A session cookie keeps you signed in on that browser. The cookie is sent only to this site and is removed when you sign out.</p>

      <h2>Listings, orders, and photos</h2>
      <p>
        Product names, descriptions, prices, quantities, categories, and photos you upload are stored so other people
        can browse them. Orders store the product, the buyer and seller wallet addresses, the amount, the payment
        type, the status, a tracking note if the seller adds one, and the Stellar transaction id after payment.
      </p>
      <p>Reviews store the rating, an optional comment, and the wallet address of the buyer who wrote them. Seller profile pages show that information.</p>

      <h2>Information on Stellar</h2>
      <p>
        USDC payments and escrow deposits are recorded on the Stellar network. Those records are public. Anyone can
        look up a transaction or a wallet address on a Stellar explorer. The Market Place cannot delete or hide an
        on-chain payment.
      </p>

      <h2>What we do not collect</h2>
      <p>
        We do not ask for a card number. Card checkout is not turned on. We do not receive your Stellar
        secret key. Signing happens in your wallet.
      </p>

      <h2>How long it is kept</h2>
      <p>
        Account, listing, order, and review records are kept while the marketplace is operating so orders can be
        shown and disputes can be understood. Photos stay attached to the listing or the order that used them. Signing
        out removes the session cookie. It does not delete the account.
      </p>

      <h2>Who can see it</h2>
      <p>
        Other shoppers can see active listings, seller display names, linked wallet addresses on a public seller page,
        and reviews. Order details are shown to the buyer and the seller. We do not sell this information.
      </p>
    </Legal>
  );
}
