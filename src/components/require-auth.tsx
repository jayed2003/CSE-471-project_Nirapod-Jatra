"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const sync = () => setAllowed(Boolean(getToken()));
    sync();
    if (!getToken()) router.replace("/account");
  }, [router]);
  if (!allowed) return <main className="subpage"><p className="auth-loading">Checking your secure session...</p></main>;
  return <>{children}</>;
}
