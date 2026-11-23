import type { Metadata } from "next";
import { Nunito_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "MDCAT Arena",
    template: "%s · MDCAT Arena",
  },
  description:
    "Practice MDCAT questions subject by subject and track your preparation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${nunitoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Suspense fallback={<main className="mx-auto max-w-6xl p-8" aria-label="Loading application" />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
