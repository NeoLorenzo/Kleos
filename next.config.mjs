/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true
      }
    : {})
};

export default nextConfig;
