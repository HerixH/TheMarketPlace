"use client";

import {
  Account,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  nativeToScVal,
  Operation,
  rpc,
  Memo,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { toStroops } from "../amount";
import {
  AUTH_OP_NAME,
  ESCROW_CONTRACT_ID,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  SOROBAN_RPC_URL,
  USDC_CODE,
  USDC_ISSUER,
} from "../config";

const horizon = new Horizon.Server(HORIZON_URL);
const sorobanRpc = new rpc.Server(SOROBAN_RPC_URL);
const USDC = new Asset(USDC_CODE, USDC_ISSUER);

export interface UsdcStatus {
  funded: boolean;
  hasTrustline: boolean;
  balance: string;
}

export interface WalletBalances {
  funded: boolean;
  hasTrustline: boolean;
  usdc: string;
  xlm: string;
}

export async function getWalletBalances(address: string): Promise<WalletBalances> {
  try {
    const account = await horizon.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    const line = account.balances.find(
      (b) => "asset_code" in b && b.asset_code === USDC_CODE && "asset_issuer" in b && b.asset_issuer === USDC_ISSUER,
    );
    return {
      funded: true,
      hasTrustline: Boolean(line),
      usdc: line?.balance ?? "0",
      xlm: native?.balance ?? "0",
    };
  } catch {
    return { funded: false, hasTrustline: false, usdc: "0", xlm: "0" };
  }
}

export async function getUsdcStatus(address: string): Promise<UsdcStatus> {
  const balances = await getWalletBalances(address);
  return { funded: balances.funded, hasTrustline: balances.hasTrustline, balance: balances.usdc };
}

async function sign(xdr: string, address: string): Promise<string> {
  const res = await signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address });
  if (res.error) throw new Error(walletError(res.error));
  return res.signedTxXdr;
}

export function walletError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Wallet request failed";
}

/** Signs a throw-away transaction proving control of `address` (never submitted). */
export async function signAuth(address: string, action: string, subject = ""): Promise<string> {
  const tx = new TransactionBuilder(new Account(address, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.manageData({ name: AUTH_OP_NAME, value: `${action}:${subject}:${Date.now()}` }))
    .setTimeout(0)
    .build();
  return sign(tx.toXDR(), address);
}

async function submitClassic(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  try {
    const res = await horizon.submitTransaction(tx);
    return res.hash;
  } catch (err) {
    const codes = (err as { response?: { data?: { extras?: { result_codes?: unknown } } } })?.response?.data?.extras
      ?.result_codes;
    if (codes) throw new Error(`Transaction rejected: ${JSON.stringify(codes)}`);
    throw err;
  }
}

/** Adds a USDC trustline so the account can hold and receive USDC. */
export async function addUsdcTrustline(address: string): Promise<string> {
  const account = await horizon.loadAccount(address);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(120)
    .build();
  return submitClassic(await sign(tx.toXDR(), address));
}

/** Direct USDC refund seller -> buyer. The order id is the memo. */
export async function refundDirect(params: {
  seller: string;
  buyer: string;
  total: string;
  orderId: string;
}): Promise<string> {
  const { seller, buyer, total, orderId } = params;
  const account = await horizon.loadAccount(seller);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: buyer, asset: USDC, amount: total }))
    .addMemo(Memo.text(orderId))
    .setTimeout(120)
    .build();
  return submitClassic(await sign(tx.toXDR(), seller));
}

/** Direct USDC payment buyer -> seller. The order id is the memo. */
export async function payDirect(params: {
  buyer: string;
  seller: string;
  total: string;
  orderId: string;
}): Promise<string> {
  const { buyer, seller, total, orderId } = params;
  const account = await horizon.loadAccount(buyer);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: seller, asset: USDC, amount: total }))
    .addMemo(Memo.text(orderId))
    .setTimeout(120)
    .build();
  return submitClassic(await sign(tx.toXDR(), buyer));
}

// ---------------------------------------------------------------------------
// Soroban escrow
// ---------------------------------------------------------------------------

async function invoke(source: string, method: string, args: ReturnType<typeof nativeToScVal>[]): Promise<string> {
  if (!ESCROW_CONTRACT_ID) throw new Error("Escrow is not configured");
  const account = await sorobanRpc.getAccount(source);
  const built = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(ESCROW_CONTRACT_ID).call(method, ...args))
    .setTimeout(120)
    .build();

  const prepared = await sorobanRpc.prepareTransaction(built);
  const signed = TransactionBuilder.fromXDR(await sign(prepared.toXDR(), source), NETWORK_PASSPHRASE);

  const sent = await sorobanRpc.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error("The network rejected the transaction");

  for (let i = 0; i < 30; i++) {
    const res = await sorobanRpc.getTransaction(sent.hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return sent.hash;
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error("The contract call failed on-chain");
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for the transaction to confirm");
}

const symbol = (v: string) => nativeToScVal(v, { type: "symbol" });
const addr = (v: string) => nativeToScVal(v, { type: "address" });

export function escrowDeposit(params: {
  orderId: string;
  buyer: string;
  seller: string;
  total: string;
  releaseAfter: number;
}) {
  return invoke(params.buyer, "deposit", [
    symbol(params.orderId),
    addr(params.buyer),
    addr(params.seller),
    nativeToScVal(toStroops(params.total), { type: "i128" }),
    nativeToScVal(params.releaseAfter, { type: "u64" }),
  ]);
}

/** Buyer confirms delivery. */
export const escrowRelease = (orderId: string, buyer: string) => invoke(buyer, "release", [symbol(orderId)]);
/** Seller cancels and returns funds. */
export const escrowRefund = (orderId: string, seller: string) => invoke(seller, "refund", [symbol(orderId)]);
/** Seller collects funds after the release deadline. */
export const escrowClaim = (orderId: string, seller: string) => invoke(seller, "claim", [symbol(orderId)]);
/** Either party freezes the escrow for arbitration. */
export const escrowDispute = (orderId: string, caller: string) =>
  invoke(caller, "dispute", [symbol(orderId), addr(caller)]);
