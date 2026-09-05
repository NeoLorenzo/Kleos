/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true
      }
    : {})
};

export default nextConfig;
