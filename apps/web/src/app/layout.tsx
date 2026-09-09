import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleFox — 开源求职自动化平台",
  description:
    "候选人掌控的、本地默认、可自托管、可扩展的开源求职自动化平台。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
