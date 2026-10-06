const publicAssetBase = import.meta.env.VITE_PUBLIC_ASSET_BASE_URL || import.meta.env.BASE_URL;

export function publicAssetUrl(path) {
  return publicAssetBase + String(path).replace(/^\/+/, '');
}
