/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // These will be available on both server and client
    NEXT_PUBLIC_GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY,
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
