import { requireReadyUser } from "@/lib/auth";
export default async function BuildingsLayout({ children }: { children: React.ReactNode }) { await requireReadyUser(); return children; }
