import type { Metadata, Viewport } from "next";
import { Archivo_Black, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Single-weight display face for headlines and numbers. Inter at 900 is close,
 * but a real display cut is what separates "bold sans-serif" from the poster
 * typography this style is built on.
 */
const display = Archivo_Black({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
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
  themeColor: "#ffd400",
  width: "device-width",
  initialScale: 1,
  // Students are on phones all day; let them zoom.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            // Toasts get the same outline and hard shadow as everything else,
            // or they read as arriving from a different application.
            style: {
              borderRadius: "var(--radius-sm)",
              border: "3px solid var(--color-ink)",
              boxShadow: "4px 4px 0 var(--color-ink)",
              background: "var(--color-surface)",
              color: "var(--color-ink)",
              fontWeight: "600",
            },
          }}
        />
      </body>
    </html>
  );
}
