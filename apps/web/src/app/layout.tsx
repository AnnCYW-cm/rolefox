import type { Metadata } from "next";
import "./rolefox.css";

export const metadata: Metadata = {
  title: "RoleFox v0.1.0-alpha.6 — 开源岗位判断工具",
  description:
    "浏览器本地运行的开源岗位判断与校准工具。没有账号、云同步、后台扫描、投递、回复或真实 Provider。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
