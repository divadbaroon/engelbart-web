import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { AccountMenu } from "@/components/account-menu";

// Server side of the account control: reads the session from the cookies
// and hands the client menu what it needs. Render inside <Suspense> so the
// page around it can still prerender.
export async function Account() {
  if (!hasEnvVars) return <AccountMenu email={null} />;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const meta = claims?.user_metadata as { avatar_url?: unknown } | undefined;
  const avatarUrl = typeof meta?.avatar_url === "string" ? meta.avatar_url : null;

  return <AccountMenu email={email} avatarUrl={avatarUrl} />;
}
