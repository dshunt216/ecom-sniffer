import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ecomm Sniffer",
  description: "Ecommerce intelligence dashboard for Amazon, Walmart, and Shopify sellers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
