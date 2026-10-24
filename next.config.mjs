/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@stellar/stellar-sdk", "pg"],
  images: {
    localPatterns: [{ pathname: "/api/uploads/**", search: "" }],
    qualities: [75, 90],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
