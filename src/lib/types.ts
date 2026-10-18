/** USDC on Stellar. */
export type PayMode = "direct" | "escrow";

export interface Account {
  id: string;
  email: string;
  name: string;
  walletAddress: string | null;
  /** Marketplace arbiter. Regular shoppers are not admins. */
  admin: boolean;
  /** Set when an admin bans the account after a violation report. */
  banned?: boolean;
  banReason?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  createdAt: string;
}

export type OrderStatus =
  | "pending" // created, waiting for payment
  | "paid" // payment confirmed on-chain
  | "shipped" // seller marked as shipped
  | "completed" // delivered and funds with the seller
  | "disputed" // buyer asked for a refund, waiting for the marketplace
  | "refund-approved" // marketplace approved the refund, seller still has to send it
  | "resolved" // marketplace denied the refund, payment stays with the seller
  | "refunded" // buyer got their money back
  | "rejected" // admin decided the order does not look genuine
  | "cancelled"; // never paid, stock released

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Decimal string, up to 7 fractional digits. */
  price: string;
  quantity: number;
  category: string;
  images: string[];
  sellerAddress: string;
  sellerName: string;
  active: boolean;
  /** Hidden because the seller account was banned. Cleared if the ban is lifted. */
  pulledForBan?: boolean;
  demo?: boolean;
  createdAt: string;
  /** Public catalog only. Not stored on the product. */
  rating?: number | null;
  reviewCount?: number;
}

export type TrackStage =
  | "placed"
  | "paid"
  | "picked-up"
  | "in-transit"
  | "out-for-delivery"
  | "delivered";

export interface TrackingUpdate {
  id: string;
  at: string;
  stage: TrackStage;
  /** 0–100, how far the shipment has gone. */
  progress: number;
  location: string;
  message: string;
  by: "system" | "seller" | "buyer" | "admin";
}

export const TRACK_STAGES: { id: TrackStage; label: string; progress: number }[] = [
  { id: "placed", label: "Order placed", progress: 10 },
  { id: "paid", label: "Payment confirmed", progress: 25 },
  { id: "picked-up", label: "Picked up", progress: 40 },
  { id: "in-transit", label: "In transit", progress: 60 },
  { id: "out-for-delivery", label: "Out for delivery", progress: 85 },
  { id: "delivered", label: "Delivered", progress: 100 },
];

export interface Order {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  buyer: string;
  seller: string;
  quantity: number;
  unitPrice: string;
  /** Total as decimal string. */
  total: string;
  mode: PayMode;
  status: OrderStatus;
  txHash: string | null;
  /** Escrow only: unix seconds after which the seller can claim. */
  releaseAfter: number | null;
  /** Public tracking number, assigned when the order is created. */
  trackingNumber: string;
  updates: TrackingUpdate[];
  /** Set when the seller accepts a paid order. Updates are allowed until delivery closes. */
  acceptedAt: string | null;
  /** Set when the buyer closes delivery. Stays set even if the seller later disputes. */
  closedAt: string | null;
  disputeMessage: string | null;
  /** Arbiter's decision after a dispute. */
  resolutionNote: string | null;
  reviewed: boolean;
  /** Filled in on order lists when this buyer already left a review. */
  review?: { rating: number; comment: string; createdAt: string } | null;
  /** Signed-in buyer. Older orders may omit it. */
  accountId?: string | null;
  /** Marketplace account behind the seller wallet. Present on order lists only. */
  sellerAccountId?: string | null;
  /** Marketplace account behind the buyer. Present on order lists only. */
  buyerAccountId?: string | null;
  /** Seller's latest fulfillment note. The paid price and quantity stay as ordered. */
  details?: OrderDetails | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetails {
  carrier: string;
  reference: string;
  note: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  seller: string;
  buyer: string;
  rating: number;
  comment: string;
  createdAt: string;
  /** Account name of the buyer, when they were signed in. */
  buyerName?: string | null;
  /** Filled for public pages so a review can open the product. */
  productId?: string | null;
  productName?: string | null;
}

export type ReportStatus = "open" | "banned" | "dismissed";

export interface Report {
  id: string;
  accountId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  accountName?: string;
  reporterName?: string;
}

export type PayoutMethod = "bank" | "mobile-money";

/** Seller cash-out from the USDC held in Lenco. */
export interface Payout {
  id: string;
  accountId: string;
  seller: string;
  /** Gross USDC taken from the Lenco balance. */
  amount: string;
  /** Marketplace charge, kept by the platform. */
  fee: string;
  /** What the seller receives after the platform fee. */
  net: string;
  method: PayoutMethod;
  accountName: string;
  /** Bank account number or mobile-money phone. */
  accountNumber: string;
  /** Bank name or mobile-money operator. */
  bankName: string;
  createdAt: string;
  /** Filled on the seller's cash-out list. */
  support?: {
    message: string;
    createdAt: string;
    reply?: string | null;
    repliedAt?: string | null;
    status?: "open" | "closed";
    closedAt?: string | null;
  }[];
}

export interface SupportRequest {
  id: string;
  accountId: string;
  payoutId: string;
  message: string;
  createdAt: string;
  /** Admin's answer. Empty until support replies. */
  reply?: string | null;
  repliedAt?: string | null;
  /** Open until an admin closes the help request. Not an order dispute. */
  status?: "open" | "closed";
  closedAt?: string | null;
  accountName?: string;
  /** Joined from the cash out for the admin inbox. */
  amount?: string;
  fee?: string;
  net?: string;
  phone?: string;
  network?: string;
}

export interface SellerProfile {
  address: string;
  name: string;
  /** Marketplace account linked to this wallet, when there is one. */
  accountId: string | null;
  banned: boolean;
  completedOrders: number;
  /** USDC from paid sales that were not refunded or cancelled. Decimal string. */
  salesVolume: string;
  /** Orders included in salesVolume. */
  salesCount: number;
  reviewCount: number;
  averageRating: number | null;
  memberSince: string | null;
  reviews: Review[];
}
