import type { Metadata } from "next";
import { ComplianceFooter } from "@/components/ComplianceFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "新颖数投 - AI 官网生成与轻量化部署",
  description: "上传企业资料与图片，AI 生成官网最终稿、完整交付包，并支持轻量化发布为公开访问链接。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <ComplianceFooter />
      </body>
    </html>
  );
}
