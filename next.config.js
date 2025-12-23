/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ///firebase: avoid build failures if eslint config changes; you still can run `npm run lint` locally
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
