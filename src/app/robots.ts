import type { MetadataRoute } from "next";

// Crawlers may index the public marketing/jobs pages, but never the private
// authenticated app or the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/"],
    },
  };
}
