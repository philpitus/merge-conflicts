import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// The component reads both fonts through CSS variables: --font-inter3 for text, --font-geist-mono for code.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Inter 3.19, variable weight: the version Figma renders with (Google Fonts now serves Inter 4, which sets wider).
// Variable so in-between weights from Figma (e.g. 460) render exactly.
const inter3 = localFont({
  src: "../fonts/inter-3-variable.woff2",
  weight: "100 900",
  variable: "--font-inter3",
  display: "block",
});

export const metadata: Metadata = {
  title: "Create PR & merge conflicts",
  description: "Changes and Create PR float over the composer. The pull request plays out as a live git log.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistMono.variable} ${inter3.variable}`}>
      <body>{children}</body>
    </html>
  );
}
