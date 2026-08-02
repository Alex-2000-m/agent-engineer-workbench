import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000/";

export const metadata: Metadata = {
  title: "Agent Workbench · 智能体工程知识工作台",
  description:
    "Fork 一套多页面 Agent 工程工作台，用自己的 GitHub 托管知识，并由本机 CLI 自动生成中文摘要、驱动 RAG 召回与知识 GC。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Agent Workbench",
    description: "网站就是 MCP：个人 GitHub 保存数据，本地 CLI 自动生成中文摘要、构建 RAG 索引并驱动知识 GC。",
    images: ["og-pixel.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Workbench",
    description: "网站就是 MCP：个人 GitHub 保存数据，本地 CLI 自动生成中文摘要、构建 RAG 索引并驱动知识 GC。",
    images: ["og-pixel.png"],
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
