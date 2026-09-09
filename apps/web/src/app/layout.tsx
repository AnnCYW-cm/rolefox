import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleFox — 开源求职 Autopilot（M0 原型）",
  description:
    "面向面试前流程的开源、本地优先求职 Autopilot。当前为静态 M0 产品原型，不执行真实扫描、投递或回复。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
