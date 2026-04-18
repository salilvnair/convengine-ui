const BASE_URL = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

export function assetUrl(fileName) {
  return `${BASE_URL}${String(fileName || "").replace(/^\/+/, "")}`;
}
