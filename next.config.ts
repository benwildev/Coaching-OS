import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Phase 11 hardening: this app renders every "document" (certificates, ID
// cards, receipts) via window.print() against server-rendered HTML — no
// iframe embedding, no next/image (uploaded media is plain <img> pointing at
// Cloudinary), and no third-party script/font CDN. That's what this CSP is
// shaped around; 'unsafe-inline' is kept for script/style (not a nonce-based
// policy) specifically to avoid forcing every page into dynamic rendering —
// see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
// "Without Nonces" section, which is the documented tradeoff for this case.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://res.cloudinary.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  // Only meaningful over HTTPS; harmless to send in dev, browsers ignore it on plain HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/platform/:path*",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/super-admin/login",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/portal/login",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/portal/forgot-password",
        destination: "/forgot-password",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
