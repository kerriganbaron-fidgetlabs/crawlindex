/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  // /check is the one route that runs at request time, and it reads the dataset to decide
  // whether a domain is already indexed. Without this the data files are traced out of the
  // serverless bundle and that lookup fails in production while working perfectly locally.
  outputFileTracingIncludes: {
    '/check': ['./data/**'],
    // /search is the no-JavaScript fallback for the search dialog and reads the same
    // dataset at request time, so it needs the same tracing exception.
    '/search': ['./data/**'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // The badge is meant to be embedded on other people's sites.
        source: '/badge/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
      {
        // Bulk dataset downloads. Open to everyone, cached hard, and served as text so a
        // browser shows them rather than downloading a mystery file.
        source: '/data/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=43200' },
        ],
      },
    ];
  },
};

export default nextConfig;
