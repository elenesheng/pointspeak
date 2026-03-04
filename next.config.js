/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Server-only env vars are accessed via process.env in API routes
    // GEMINI_API_KEY is intentionally NOT exposed to the client
    VERTEX_PROJECT_ID: process.env.VERTEX_PROJECT_ID,
    VERTEX_LOCATION: process.env.VERTEX_LOCATION,
  },
  images: {
    domains: [],
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

module.exports = nextConfig;
