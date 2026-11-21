
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subjects")
    .select("id")
    .limit(1);

  return (
    <main className="p-10">
      <h1 className="text-2xl font-bold">MDCAT Arena</h1>
      <p>
        {error
          ? `Supabase response: ${error.message}`
          : "Supabase connected successfully!"}
      </p>
    </main>
  );
}
