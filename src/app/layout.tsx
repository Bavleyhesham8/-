import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: "مركز قيثارة داود | نظام إدارة المركز والتعافي",
  description: "النظام الشامل لإدارة النزلاء، العيادة، الكانتين، المخازن، والعهد بمركز قيثارة داود",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className={cairo.className}>{children}</body>
    </html>
  );
}
