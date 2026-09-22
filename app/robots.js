export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/"
      }
    ],
    sitemap: "https://kleos.fabbrosystems.com/sitemap.xml",
    host: "https://kleos.fabbrosystems.com"
  };
}
