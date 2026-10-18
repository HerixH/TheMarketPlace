// Adds demo listings so the storefront has something to show.
// Demo listings cannot be purchased. Run with: npm run seed
import { randomBytes, scryptSync } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const SEED_IMAGES = path.join(process.cwd(), "scripts", "seed-images");
// Set ADMIN_PASSWORD on any public deployment; the demo password is published in the README.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "marketplace";
// The all-zero public key: a valid address that nobody controls.
const DEMO_SELLER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const DEMO_EMAIL = "demo@themarketplace.test";
const DEMO_PASSWORD = "marketplace";
const DEMO_NAME = "Demo Shopper";
const DEMO_ACCOUNT_ID = "demoaccount01";
const ADMIN_EMAIL = "admin@themarketplace.test";
const ADMIN_NAME = "Market Admin";
const ADMIN_ACCOUNT_ID = "adminaccount01";
const DEMO_BUYER = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";

// Royalty-free test photos (Unsplash / Pexels) saved in data/uploads.
const items = [
  ["Noise-cancelling headphones", "Electronics", "129.00", 8, "Over-ear wireless headphones with 30h battery.", "d00000000000000000000001"],
  ["Mechanical keyboard", "Electronics", "89.50", 14, "Hot-swappable 75% keyboard with tactile switches.", "d00000000000000000000002"],
  ["Vintage denim jacket", "Fashion", "64.00", 3, "90s oversized denim jacket, great condition.", "d00000000000000000000003"],
  ["Linen summer dress", "Fashion", "48.00", 12, "Breathable linen dress, available in sand.", "d00000000000000000000004"],
  ["Hydrating face serum", "Beauty", "26.00", 40, "Lightweight hyaluronic serum for everyday use.", "d00000000000000000000005"],
  ["Matte lipstick set", "Beauty", "19.90", 25, "Set of three long-wear matte lipsticks.", "d00000000000000000000006"],
  ["Ceramic plant pot", "Home & Garden", "22.00", 18, "Hand-glazed pot with drainage tray.", "d00000000000000000000007"],
  ["Rare 1st edition comic", "Collectibles", "310.00", 1, "Bagged and boarded, certified authentic.", "d00000000000000000000008"],
  ["Learn Rust (paperback)", "Books", "34.00", 9, "Beginner-friendly guide to systems programming.", "d00000000000000000000009"],
  ["Yoga mat", "Sports", "29.00", 20, "Non-slip 6mm mat with carry strap.", "d0000000000000000000000a"],
  ["Icon pack (SVG)", "Digital Goods", "12.00", 999, "400 hand-drawn icons, commercial licence.", "d0000000000000000000000b"],
  ["Smart water bottle", "Sports", "37.50", 15, "Tracks hydration and glows to remind you.", "d0000000000000000000000c"],
];

let db = { products: [], orders: [], reviews: [] };
try {
  db = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
} catch {}

db.products = db.products.filter((p) => !p.demo);
const now = Date.now();
items.forEach(([name, category, price, quantity, description, image], i) => {
  db.products.push({
    id: `demo${String(i).padStart(2, "0")}`,
    name,
    description,
    price,
    quantity,
    category,
    images: [
      `/api/uploads/${image}.jpg`,
      `/api/uploads/${image.replace(/^d/, "e")}.jpg`,
      `/api/uploads/${image.replace(/^d/, "f")}.jpg`,
    ],
    sellerAddress: DEMO_SELLER,
    sellerName: "Demo Store",
    active: true,
    demo: true,
    createdAt: new Date(now - i * 3600_000).toISOString(),
  });
});

db.accounts ??= [];
db.sessions ??= [];
db.orders ??= [];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function upsertAccount({ id, email, name, admin }) {
  const createdAt = new Date().toISOString();
  const password = admin ? ADMIN_PASSWORD : DEMO_PASSWORD;
  const existing = db.accounts.find((a) => a.id === id || a.email === email);
  if (existing) {
    existing.id = id;
    existing.email = email;
    existing.name = name;
    existing.passwordHash = hashPassword(password);
    existing.admin = admin;
    existing.walletAddress ??= null;
    existing.createdAt ??= createdAt;
    return;
  }
  db.accounts.push({
    id,
    email,
    name,
    passwordHash: hashPassword(password),
    walletAddress: null,
    admin,
    createdAt,
  });
}

upsertAccount({ id: DEMO_ACCOUNT_ID, email: DEMO_EMAIL, name: DEMO_NAME, admin: false });
upsertAccount({ id: ADMIN_ACCOUNT_ID, email: ADMIN_EMAIL, name: ADMIN_NAME, admin: true });

if (!db.orders.some((o) => o.id === "demodispute01")) {
  const at = new Date(now - 2 * 3600_000).toISOString();
  db.orders.push({
    id: "demodispute01",
    productId: "demo00",
    productName: "Noise-cancelling headphones",
    productImage: "/api/uploads/d00000000000000000000001.jpg",
    buyer: DEMO_BUYER,
    seller: DEMO_SELLER,
    quantity: 1,
    unitPrice: "129.00",
    total: "129.00",
    mode: "escrow",
    status: "disputed",
    txHash: null,
    releaseAfter: null,
    trackingNumber: "MP-DEMO-0001",
    updates: [
      {
        id: "demo-upd-1",
        at,
        stage: "placed",
        progress: 10,
        location: "",
        message: "Order placed.",
        by: "system",
      },
      {
        id: "demo-upd-2",
        at,
        stage: "delivered",
        progress: 100,
        location: "Lusaka",
        message: "Delivery closed.",
        by: "system",
      },
    ],
    closedAt: at,
    disputeMessage: "The headphones arrived damaged. Please refund the buyer.",
    resolutionNote: null,
    reviewed: false,
    accountId: DEMO_ACCOUNT_ID,
    createdAt: at,
    updatedAt: at,
  });
}

await fs.mkdir(UPLOAD_DIR, { recursive: true });
for (const file of await fs.readdir(SEED_IMAGES).catch(() => [])) {
  await fs.copyFile(path.join(SEED_IMAGES, file), path.join(UPLOAD_DIR, file)).catch(() => undefined);
}

await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
console.log(`Seeded ${items.length} demo products.`);
console.log(`Demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
console.log(`Admin account: ${ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD ? "(ADMIN_PASSWORD)" : DEMO_PASSWORD}`);
