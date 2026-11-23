import type { Metadata } from "next";
import { ChartNoAxesColumn } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Performance" };

export default function Page() {
  return (
    <PlaceholderPage
      icon={ChartNoAxesColumn}
      title="Performance: coming soon"
      description="Detailed performance analytics will appear here once practice attempts are being recorded."
    />
  );
}
