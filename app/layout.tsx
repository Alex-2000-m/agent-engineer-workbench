import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000/";

export const metadata: Metadata = {
  title: "Agent Workbench · 智能体工程知识工作台",
  description:
    "聚合五类 Agent 工程来源，用 AI 提炼导读，并以可配置策略保持知识新鲜。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Agent Workbench",
    description: "五类来源、AI 导读、个人策略，把变化沉淀成可验证的工程知识。",
    images: ["og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Workbench",
    description: "五类来源、AI 导读、个人策略，把变化沉淀成可验证的工程知识。",
    images: ["og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
