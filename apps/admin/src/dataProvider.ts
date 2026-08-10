import { API } from "./apiBase";
import simpleRestProvider from "ra-data-simple-rest";
import { fetchUtils } from "react-admin";

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = localStorage.getItem("nv_admin_token");
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetchUtils.fetchJson(url, { ...options, headers });
};

export const dataProvider = simpleRestProvider(
  `${API}/admin`,
  httpClient
);
