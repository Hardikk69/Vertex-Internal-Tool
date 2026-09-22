import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export type Profile = {
  id: string;
  role: "team" | "client";
  name: string;
  client_id: string | null;
  client: { name: string } | null; // the client's company, for client logins
};

// signedIn with profile === null means the login exists but isn't onboarded yet.
type Auth = { loading: boolean; signedIn: boolean; profile: Profile | null };

const AuthContext = createContext<Auth>({ loading: true, signedIn: false, profile: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth>({ loading: true, signedIn: false, profile: null });

  useEffect(() => {
    let current: string | null | undefined; // undefined = no auth event seen yet
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      if (id === current) return; // token refreshes etc.
      current = id;
      if (!id) return setAuth({ loading: false, signedIn: false, profile: null });
      // deferred: awaiting supabase calls inside this callback can deadlock the auth client
      setTimeout(async () => {
        const { data: profile, error } = await supabase
          .from("users")
          .select("id, role, name, client_id, client:clients(name)")
          .eq("id", id)
          .maybeSingle();
        if (error) toast.error(`Couldn't load your profile: ${error.message}`);
        // cast: without generated types supabase-js types the to-one `client` embed as an array
        if (current === id)
          setAuth({ loading: false, signedIn: true, profile: profile as Profile | null });
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
