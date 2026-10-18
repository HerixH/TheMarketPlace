/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@stellar/stellar-sdk", "pg"],
};

export default nextConfig;
