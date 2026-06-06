import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LinkedIn Auto Poster",
  description: "Automated LinkedIn content publishing system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
