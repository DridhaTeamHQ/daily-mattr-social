import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DailyMattr Socials",
    template: "%s · DailyMattr Socials",
  },
  description:
    "The student ambassador platform for DailyMattr — surveys, Instagram campaigns, and referrals in one place.",
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  width: "device-width",
  initialScale: 1,
  // Students are on phones all day; let them zoom.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-line)",
              boxShadow: "var(--shadow-pop)",
            },
          }}
        />
      </body>
    </html>
  );
}
