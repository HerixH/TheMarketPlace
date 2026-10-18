import "server-only";
import { randomBytes } from "crypto";
import { TRACK_STAGES, type Order, type TrackStage, type TrackingUpdate } from "../types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newTrackingNumber(): string {
  const bytes = randomBytes(8);
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  return `MP-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function stageProgress(stage: TrackStage): number {
  return TRACK_STAGES.find((s) => s.id === stage)?.progress ?? 0;
}

export function addUpdate(
  order: Order,
  update: { stage: TrackStage; location: string; message: string; by: TrackingUpdate["by"] },
) {
  if (!order.updates) order.updates = [];
  if (update.by === "system" && order.updates.some((u) => u.stage === update.stage)) return;
  order.updates.push({
    id: randomBytes(6).toString("hex"),
    at: new Date().toISOString(),
    stage: update.stage,
    progress: stageProgress(update.stage),
    location: update.location,
    message: update.message,
    by: update.by,
  });
}

/** Marks delivery closed. A later seller dispute does not clear this. */
export function closeDelivery(order: Order) {
  if (order.closedAt) return;
  order.closedAt = new Date().toISOString();
  order.status = "completed";
  addUpdate(order, {
    stage: "delivered",
    location: "",
    message: "Delivery closed. This stays closed unless the seller opens a dispute.",
    by: "system",
  });
}
