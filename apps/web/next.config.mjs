/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dockforge/shared"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
