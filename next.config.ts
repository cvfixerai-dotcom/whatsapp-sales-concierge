import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// after() is stable in Next.js 15.1 — no experimental flag needed
const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  // Suppresses source map uploading logs during build
  silent: true,
  // Disable source map upload when no auth token is available
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
