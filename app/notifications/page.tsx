import { requireUser } from "@/lib/auth";
import NotificationsClient from "./NotificationsClient";

export const metadata = { title: "Уведомления" };

export default async function NotificationsPage() {
  await requireUser();
  return <NotificationsClient />;
}
