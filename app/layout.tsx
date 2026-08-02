import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000/";

export const metadata: Metadata = {
  title: "Agent Workbench · 智能体工程知识工作台",
  description:
    "Fork 一套多页面 Agent 工程工作台，用自己的 GitHub 托管知识，并由本机 CLI 驱动 AI 能力。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Agent Workbench",
    description: "框架共用，知识归你的 GitHub Fork；本地 CLI 完成 AI 导读、分类与核验。",
    images: ["og-fork.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Workbench",
    description: "框架共用，知识归你的 GitHub Fork；本地 CLI 完成 AI 导读、分类与核验。",
    images: ["og-fork.png"],
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
