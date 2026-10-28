// Next.js configuration
/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" creates a self-contained server (server.js + minimal node_modules)
  // so the app can run on a computer where `npm install` is blocked.
  output: 'standalone',
  // These packages run only on the server and must not be bundled by Next.js
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Never copy the local database folder into the build
  outputFileTracingExcludes: { '*': ['./pgdata/**'] },
  // Allow larger Server Action bodies (movement form) - default is fine but explicit here
  experimental: { serverActions: { bodySizeLimit: '1mb' } }
};

export default nextConfig;
