import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lên đường · Lịch trình chuyến đi",
  description: "Từng điểm dừng, từng khoảnh khắc. Lên lịch chuyến đi, quản lý ngân sách, đặt chỗ và hành lý của bạn.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
