import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgroMind AI",
  description: "Authorized, auditable agricultural intelligence",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
