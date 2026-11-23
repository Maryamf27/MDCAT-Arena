import type { Metadata } from "next";
import { History } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "History" };

export default function Page() {
  return (
    <PlaceholderPage
      icon={History}
      title="History: coming soon"
      description="Your past practice sessions will be listed here once attempts are saved."
    />
  );
}
