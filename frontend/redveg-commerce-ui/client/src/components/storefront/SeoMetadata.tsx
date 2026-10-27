import { useEffect } from "react";

const SITE_ORIGIN = "https://redveg.in";

type SeoMetadataProps = {
  title: string;
  description: string;
  canonicalPath: string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | null;
};

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

/** Keeps the document head aligned with the visible storefront route. */
export function SeoMetadata({
  title,
  description,
  canonicalPath,
  noIndex = false,
  structuredData = null,
}: SeoMetadataProps) {
  useEffect(() => {
    const canonicalUrl = new URL(canonicalPath, SITE_ORIGIN).toString();
    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "robots", noIndex ? "noindex, follow" : "index, follow, max-image-preview:large");
    setMeta("property", "og:type", structuredData?.["@type"] === "Product" ? "product" : "website");
    setMeta("property", "og:site_name", "RedVeg");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const schemaId = "redveg-route-structured-data";
    document.getElementById(schemaId)?.remove();
    if (structuredData) {
      const script = document.createElement("script");
      script.id = schemaId;
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }

    return () => {
      document.getElementById(schemaId)?.remove();
    };
  }, [title, description, canonicalPath, noIndex, structuredData]);

  return null;
}

export function cleanSeoText(value: string, maxLength = 300) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
