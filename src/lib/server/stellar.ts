import "server-only";
import {
  Account,
  Contract,
  Horizon,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { toStroops } from "../amount";
import {
  AUTH_MAX_AGE_MS,
  AUTH_OP_NAME,
  ESCROW_CONTRACT_ID,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  SOROBAN_RPC_URL,
  USDC_CODE,
  USDC_ISSUER,
} from "../config";

export const horizon = new Horizon.Server(HORIZON_URL);
const sorobanRpc = new rpc.Server(SOROBAN_RPC_URL);

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isValidAddress(address: unknown): address is string {
  return typeof address === "string" && /^G[A-Z2-7]{55}$/.test(address);
}

// ---------------------------------------------------------------------------
// Wallet-signature authentication
//
// To prove control of an address the client signs a throw-away transaction
// (sequence 0, never submitted) carrying a manageData op with the value
// `action:subject:timestamp`. This works with every Stellar wallet.
// ---------------------------------------------------------------------------

export function verifyAuth(params: {
  xdr: unknown;
  address: string;
  action: string;
  subject?: string;
}): void {
  const { xdr, address, action, subject = "" } = params;
  if (typeof xdr !== "string" || !isValidAddress(address)) {
    throw new HttpError(401, "Missing wallet signature");
  }
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE) as Transaction;
  } catch {
    throw new HttpError(401, "Malformed wallet signature");
  }
  if (tx.source !== address || tx.operations.length !== 1) {
    throw new HttpError(401, "Signature does not match wallet");
  }
  const op = tx.operations[0];
  if (op.type !== "manageData" || op.name !== AUTH_OP_NAME || !op.value) {
    throw new HttpError(401, "Invalid signature payload");
  }
  const parts = Buffer.from(op.value).toString("utf8").split(":");
  const timestamp = Number(parts.pop());
  const claimed = parts.join(":");
  if (claimed !== `${action}:${subject}`) throw new HttpError(401, "Signature is for another action");
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > AUTH_MAX_AGE_MS) {
    throw new HttpError(401, "Signature expired, please try again");
  }
  const keypair = Keypair.fromPublicKey(address);
  const hash = tx.hash();
  const ok = tx.signatures.some((s) => {
    try {
      return keypair.verify(hash, Buffer.from(s.signature.toBytes()));
    } catch {
      return false;
    }
  });
  if (!ok) throw new HttpError(401, "Invalid wallet signature");
}

// ---------------------------------------------------------------------------
// Account checks
// ---------------------------------------------------------------------------

/** Verifies the seller account exists and can receive USDC. */
export async function assertCanReceiveUsdc(address: string): Promise<void> {
  try {
    const account = await horizon.loadAccount(address);
    const hasTrustline = account.balances.some(
      (b) =>
        "asset_code" in b && b.asset_code === USDC_CODE && "asset_issuer" in b && b.asset_issuer === USDC_ISSUER,
    );
    if (!hasTrustline) {
      throw new HttpError(
        400,
        "This wallet has no USDC trustline yet. Add USDC to your wallet before listing products.",
      );
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as { response?: { status?: number } })?.response?.status === 404) {
      throw new HttpError(400, "This wallet is not funded on the Stellar network yet.");
    }
    throw new HttpError(502, "Could not reach the Stellar network. Try again shortly.");
  }
}

// ---------------------------------------------------------------------------
// Direct payments (classic USDC payment operation)
// ---------------------------------------------------------------------------

async function verifyUsdcTransfer(params: {
  txHash: string;
  orderId: string;
  from: string;
  to: string;
  total: string;
}): Promise<void> {
  const { txHash, orderId, from, to, total } = params;
  if (!/^[a-f0-9]{64}$/i.test(txHash)) throw new HttpError(400, "Invalid transaction hash");

  let tx;
  let ops;
  try {
    tx = await horizon.transactions().transaction(txHash).call();
    ops = await horizon.operations().forTransaction(txHash).limit(200).call();
  } catch {
    throw new HttpError(404, "Transaction not found on the Stellar network yet");
  }
  if (!tx.successful) throw new HttpError(400, "That transaction failed on-chain");
  if (tx.memo_type !== "text" || tx.memo !== orderId) {
    throw new HttpError(400, "Transaction memo does not match this order");
  }

  const expected = toStroops(total);
  const match = ops.records.some((op) => {
    if (op.type !== "payment") return false;
    const p = op as unknown as {
      from: string;
      to: string;
      amount: string;
      asset_code?: string;
      asset_issuer?: string;
    };
    return (
      p.from === from &&
      p.to === to &&
      p.asset_code === USDC_CODE &&
      p.asset_issuer === USDC_ISSUER &&
      toStroops(p.amount) === expected
    );
  });
  if (!match) throw new HttpError(400, "No matching USDC payment found in that transaction");
}

export function verifyDirectPayment(params: {
  txHash: string;
  orderId: string;
  buyer: string;
  seller: string;
  total: string;
}): Promise<void> {
  return verifyUsdcTransfer({
    txHash: params.txHash,
    orderId: params.orderId,
    from: params.buyer,
    to: params.seller,
    total: params.total,
  });
}

/** Seller returning USDC to the buyer after the marketplace approves a refund. */
export function verifyRefundPayment(params: {
  txHash: string;
  orderId: string;
  buyer: string;
  seller: string;
  total: string;
}): Promise<void> {
  return verifyUsdcTransfer({
    txHash: params.txHash,
    orderId: params.orderId,
    from: params.seller,
    to: params.buyer,
    total: params.total,
  });
}

// ---------------------------------------------------------------------------
// Soroban escrow
// ---------------------------------------------------------------------------

export type EscrowStatus = "Funded" | "Released" | "Refunded" | "Disputed" | "Resolved" | "Claimed";

export interface OnChainEscrow {
  buyer: string;
  seller: string;
  amount: bigint;
  releaseAfter: number;
  status: EscrowStatus;
}

/** Reads an escrow from the contract. Returns null if it does not exist. */
export async function readEscrow(orderId: string): Promise<OnChainEscrow | null> {
  if (!ESCROW_CONTRACT_ID) throw new HttpError(503, "Escrow is not configured on this deployment");
  const contract = new Contract(ESCROW_CONTRACT_ID);
  const source = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(source, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call("get", nativeToScVal(orderId, { type: "symbol" })))
    .setTimeout(30)
    .build();

  const sim = await sorobanRpc.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) return null;

  const value = scValToNative(sim.result.retval) as {
    buyer: string;
    seller: string;
    amount: bigint;
    release_after: bigint;
    status: string | string[];
  };
  const status = (Array.isArray(value.status) ? value.status[0] : value.status) as EscrowStatus;
  return {
    buyer: value.buyer,
    seller: value.seller,
    amount: BigInt(value.amount),
    releaseAfter: Number(value.release_after),
    status,
  };
}
