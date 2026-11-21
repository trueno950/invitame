import type { NextConfig } from "next";

// The largest body this web server accepts on a request it handles itself (M9 T13; S8). The invitation editor uploads
// a photo through a server action on a `/cuenta` page, so two Next defaults apply before any of our code runs: the
// server-action body limit (1 MB) and the body cap of a request that passes through `proxy.ts` (10 MB). Both are raised
// to the API's own upload request cap (`MAX_UPLOAD_REQUEST_BYTES`, 16 MB: the widest configurable photo of 15 MB plus
// the multipart fields), so the size an administrator configures is the one that decides. Every server action and every
// proxied route still requires a session, and the API remains the guard that refuses an oversized photo.
export const WEB_REQUEST_BODY_LIMIT = "16mb";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: WEB_REQUEST_BODY_LIMIT },
    proxyClientMaxBodySize: WEB_REQUEST_BODY_LIMIT,
  },
};

export default nextConfig;
