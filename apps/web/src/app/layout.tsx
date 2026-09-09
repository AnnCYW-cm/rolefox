import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleFox — AI 求职助手",
  description: "会替你找岗、筛选、准备材料并追踪面试的开源 AI 求职助手。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
