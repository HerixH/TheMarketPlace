import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AccountProvider } from "@/components/AccountProvider";
import { CartProvider } from "@/components/CartProvider";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { RouteLoader, RouteLoaderProvider } from "@/components/RouteLoader";
import { TabBar } from "@/components/TabBar";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Market Place: buy and sell with USDC on chain and off chain",
  description:
    "A marketplace where buyers and sellers trade directly, with USDC on chain on Stellar and off chain card checkout.",
  applicationName: "The Market Place",
  appleWebApp: { capable: true, title: "The Market Place", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e8175d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <AccountProvider>
            <CartProvider>
              <RouteLoaderProvider>
                <Header />
                <main>{children}</main>
                <Footer />
                <Suspense fallback={null}>
                  <RouteLoader />
                </Suspense>
                <TabBar />
              </RouteLoaderProvider>
            </CartProvider>
          </AccountProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
