import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    // Enables after() from 'next/server' — schedules work to run AFTER
    // the response has been sent to the client. This is the key fix for
    // the Twilio webhook: we return 200 to Twilio in <500ms, then run
    // the AI processing in the background (~6-8s). Cuts customer-facing
    // wait time from 40+ seconds to ~6-8 seconds.
    // @ts-ignore — 'after' was added in Next.js 15.1 but type defs lag behind
    after: true,
  },
};

export default withSentryConfig(nextConfig, {
  // Suppresses source map uploading logs during build
  silent: true,
  // Disable source map upload when no auth token is available
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
