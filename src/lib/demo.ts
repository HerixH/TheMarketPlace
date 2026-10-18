/** Used only when the demo shopper has not linked a wallet. */
export const DEMO_BUYER = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";

/** Seeded store behind the demo listings. It has no Freighter key. */
export const DEMO_SELLER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const DEMO_SELLER_EMAIL = "seller@themarketplace.test";

/** Seeded shopper that is allowed to buy demo listings without sending USDC. */
export function isDemoShopper(account: { id?: string; email?: string } | null | undefined): boolean {
  if (!account) return false;
  return account.id === "demoaccount01" || account.email === "demo@themarketplace.test";
}
