import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleFox — Pre-user Alpha 岗位判断原型",
  description:
    "浏览器本地运行的岗位判断与校准原型。没有账号、云同步、后台扫描、投递、回复或真实 Provider。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
