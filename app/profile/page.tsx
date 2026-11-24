import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile/profile-form";
import { SectionHeading } from "@/components/ui/section";

export const metadata: Metadata = { title: "Profile", description: "View and update your MDCAT Arena profile." };

export default function Page() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <SectionHeading title="Your profile" description="Manage how your name appears in MDCAT Arena." />
      <ProfileForm />
    </div>
  );
}
