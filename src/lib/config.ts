const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "public" ? "public" : "testnet";

export const IS_MAINNET = network === "public";
export const NETWORK_NAME = IS_MAINNET ? "Mainnet" : "Testnet";

export const NETWORK_PASSPHRASE = IS_MAINNET
  ? "Public Global Stellar Network ; September 2015"
  : "Test SDF Network ; September 2015";

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ||
  (IS_MAINNET ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org");

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
  (IS_MAINNET ? "https://mainnet.sorobanrpc.com" : "https://soroban-testnet.stellar.org");

/** Circle's USDC issuer accounts. */
export const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  (IS_MAINNET
    ? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    : "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

export const USDC_CODE = "USDC";

export const ESCROW_CONTRACT_ID = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID || "";
export const ESCROW_ENABLED = ESCROW_CONTRACT_ID.length > 0;

/** Seconds after which a seller may claim escrowed funds if the buyer is silent. */
export const ESCROW_RELEASE_SECONDS = 14 * 24 * 60 * 60;

export const EXPLORER_URL = IS_MAINNET
  ? "https://stellar.expert/explorer/public"
  : "https://stellar.expert/explorer/testnet";

export const AUTH_OP_NAME = "themarketplace";
export const AUTH_MAX_AGE_MS = 5 * 60 * 1000;
