/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/agentic-travels',
  async redirects() {
    return [
      {
        source: '/',
        destination: '/agentic-travels',
        basePath: false,
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig
