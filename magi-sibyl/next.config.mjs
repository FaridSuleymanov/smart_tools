/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure server-only modules don't leak to client bundles
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
