"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return <button disabled={pending} onClick={async () => { setPending(true); await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }} className="site-logout disabled:opacity-50">Выйти</button>;
}
