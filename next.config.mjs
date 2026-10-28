import bundleAnalyzer from "@next/bundle-analyzer";

// ANALYZE=1 npm run build → opens a treemap of every client and server bundle.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "1" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "www.thesportsdb.com" },
      { protocol: "https", hostname: "media.api-sports.io" },
    ],
  },
  experimental: {
    // Keep pages fetched during client navigation for 30 s, so going back to a page is instant.
    // Every action in the app calls router.refresh(), which empties this cache: no stale data after your own click.
    staleTimes: { dynamic: 30, static: 180 },
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tooltip",
    ],
  },
  // No other site may frame the dashboard (its Place and Settings buttons cannot be clickjacked), no MIME sniffing.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default withBundleAnalyzer(nextConfig);
