import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000/";

export const metadata: Metadata = {
  title: "Agent Workbench · 智能体工程知识工作台",
  description:
    "追踪 Agent 工程变化，验证可信知识，并让过期内容及时退出默认检索。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Agent Workbench",
    description: "把变化沉淀为可验证、可复用、会过期的工程知识。",
    images: ["og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Workbench",
    description: "把变化沉淀为可验证、可复用、会过期的工程知识。",
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
