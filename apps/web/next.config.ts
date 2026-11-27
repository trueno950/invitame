import type { NextConfig } from "next";

// The largest body this web server accepts on a request it handles itself (M9 T13; S8). The invitation editor uploads
// a photo through a server action on a `/cuenta` page, so two Next defaults apply before any of our code runs: the
// server-action body limit (1 MB) and the body cap of a request that passes through `proxy.ts` (10 MB). Both are raised
// to the API's own upload request cap (`MAX_UPLOAD_REQUEST_BYTES`, 16 MB: the widest configurable photo of 15 MB plus
// the multipart fields), so the size an administrator configures is the one that decides. Every server action and every
// proxied route still requires a session, and the API remains the guard that refuses an oversized photo.
export const WEB_REQUEST_BODY_LIMIT = "16mb";

/**
 * The only origin a guest invitation frames (F9; L12.3, L12.4): YouTube's privacy-enhanced embed host. A player is drawn
 * inside the invitation, so the page states it in `frame-src` instead of leaving the framing unrestricted, and no other
 * origin is added.
 */
export const INVITATION_FRAME_SRC = "https://www.youtube-nocookie.com";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: WEB_REQUEST_BODY_LIMIT },
    proxyClientMaxBodySize: WEB_REQUEST_BODY_LIMIT,
  },
  /**
   * The guest pages' Content Security Policy: additive and scoped, so only `/i/...` gains a `frame-src` restriction and
   * the owner's preview (a same-origin frame under `/cuenta`) keeps the framing it always had. Nothing else is restricted,
   * because the web server sets no other directive anywhere.
   */
  async headers() {
    return [
      {
        source: "/i/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-src ${INVITATION_FRAME_SRC}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
