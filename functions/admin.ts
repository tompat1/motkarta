import { serveAdminSpa, type AdminSpaEnv, type AdminSpaEventContext } from "../lib/admin-spa.ts";

export async function onRequest(context: AdminSpaEventContext<AdminSpaEnv>) {
  return serveAdminSpa(context);
}
