import { serveAdminSpa, type AdminSpaEnv, type AdminSpaEventContext } from "../../../lib/admin-spa.ts";

export async function onRequestGet(context: AdminSpaEventContext<AdminSpaEnv>) {
  return serveAdminSpa(context);
}

export async function onRequestHead(context: AdminSpaEventContext<AdminSpaEnv>) {
  return serveAdminSpa(context);
}

export async function onRequest(context: AdminSpaEventContext<AdminSpaEnv>) {
  return serveAdminSpa(context);
}
