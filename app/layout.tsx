import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000/";

export const metadata: Metadata = {
  title: "Agent Workbench · 智能体工程知识工作台",
  description:
    "一键安装本地 MCP，用本机 CLI 驱动 Agent 工程知识导读、分类、核验与维护。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Agent Workbench",
    description: "GitHub 托管知识，本地 CLI 完成 AI 导读、分类、核验与维护。",
    images: ["og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Workbench",
    description: "GitHub 托管知识，本地 CLI 完成 AI 导读、分类、核验与维护。",
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
