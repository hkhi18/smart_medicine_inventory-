// Next.js configuration
/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" creates a self-contained server (server.js + minimal node_modules)
  // so the app can run on a computer where `npm install` is blocked.
  output: 'standalone',
  // These packages run only on the server and must not be bundled by Next.js
  // (@resvg/resvg-js is a native module that draws the ROP report PNG)
  serverExternalPackages: ['@electric-sql/pglite', 'pg', '@resvg/resvg-js'],
  // Never copy the local database folder into the build
  outputFileTracingExcludes: { '*': ['./pgdata/**'] },
  // Make sure the TTF fonts used by the ROP report image are deployed with that route
  outputFileTracingIncludes: {
    '/api/reports/rop-image': ['./assets/fonts/**/*']
  },
  // Allow larger Server Action bodies (movement form) - default is fine but explicit here
  experimental: { serverActions: { bodySizeLimit: '1mb' } }
};

export default nextConfig;