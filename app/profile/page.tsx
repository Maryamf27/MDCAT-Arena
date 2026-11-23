import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return (
    <PlaceholderPage
      icon={UserRound}
      title="Profile: coming soon"
      description="Profile settings are not built yet. Your signed-in account is shown in the header."
    />
  );
}
