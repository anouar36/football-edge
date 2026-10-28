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
    optimizePackageImports: ["lucide-react"],
  },
  // No other site may frame the dashboard (its Place and Settings buttons cannot be clickjacked), no MIME sniffing.
  async headers() {
    return [
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
