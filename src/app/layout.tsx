import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "@/components/Providers";
import "./globals.css";

const lxgwWenKai = localFont({
  src: [
    {
      path: "./fonts/LXGWWenKaiLite-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/LXGWWenKaiLite-Medium.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-lxgw-wenkai",
  display: "swap",
});

const lxgwWenKaiMono = localFont({
  src: [
    {
      path: "./fonts/LXGWWenKaiMonoLite-Regular.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-lxgw-wenkai-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "社保规划助手",
  description:
    "智能驱动的社保规划，精准计算退休时间、养老金预估、医保衔接方案及可享补贴。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className={`${lxgwWenKai.variable} ${lxgwWenKaiMono.variable}`}
    >
      <body className="antialiased text-foreground bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
