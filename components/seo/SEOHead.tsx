'use client';

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SEO_KEYWORDS_CONTENT } from "@/constants/seoKeywords";

export interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  type?: "website" | "article";
  keywords?: string;
  noIndex?: boolean;
}

const SITE_NAME = "Gist me";
const SITE_ORIGIN = "https://www.gistme.online";
const DEFAULT_DESCRIPTION =
  "Join Ghanaian SHS communities on Gist me. Share campus gists, student stories, confessions, shoutouts, and spotlighted posts.";

function routeMetadata(pathname: string): { title: string; description: string; noIndex?: boolean } {
  if (pathname === "/") {
    return {
      title: "Gist me - Ghana SHS Community",
      description: DEFAULT_DESCRIPTION,
    };
  }
  if (pathname === "/explore" || pathname === "/trending") {
    return {
      title: pathname === "/trending" ? "Trending Gists | Gist me" : "Explore Ghana SHS Gists | Gist me",
      description: "Explore trending gists, student conversations, and Ghanaian SHS communities on Gist me.",
    };
  }
  if (pathname === "/spotlight") {
    return {
      title: "SHS Spotlight Gists | Gist me",
      description: "Discover active Spotlight gists shared with Ghanaian Senior High School communities.",
    };
  }
  if (pathname === "/schools") {
    return {
      title: "Ghana SHS School Directory | Gist me",
      description: "Find and join Senior High School and TVET communities from every region of Ghana.",
    };
  }
  if (pathname === "/confessions") {
    return {
      title: "Anonymous SHS Confessions | Gist me",
      description: "Read moderated anonymous confessions and student stories from Ghanaian SHS communities.",
    };
  }
  if (pathname === "/login" || pathname === "/register" || pathname === "/auth") {
    return {
      title: pathname === "/login" ? "Log in | Gist me" : "Join Gist me",
      description: "Log in or create your Gist me student pass to connect with Ghanaian SHS communities.",
    };
  }
  if (pathname === "/privacy") {
    return {
      title: "Privacy Information | Gist me",
      description: "Learn how Gist me handles student account information, public posts, and safety reports.",
    };
  }
  if (pathname === "/terms") {
    return {
      title: "Terms of Use | Gist me",
      description: "Read the terms and community safety expectations for using Gist me.",
    };
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/profile")) {
    return {
      title: "Gist me",
      description: DEFAULT_DESCRIPTION,
      noIndex: true,
    };
  }
  return { title: SITE_NAME, description: DEFAULT_DESCRIPTION };
}

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function setCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }
  element.href = href;
}

export function SEOHead({
  title,
  description,
  image = "/logo.png",
  type = "website",
  keywords,
  noIndex,
}: SEOHeadProps = {}) {
  const pathname = usePathname();

  useEffect(() => {
    const sharedConfession = pathname !== "/confessions/create" && /^\/confessions\/[^/]+$/.test(pathname);
    if (
      pathname.startsWith("/posts/") ||
      pathname.startsWith("/schools/") ||
      sharedConfession
    ) return;
    const defaults = routeMetadata(pathname);
    const pageTitle = title ?? defaults.title;
    const pageDescription = description ?? defaults.description;
    const canonicalUrl = `${SITE_ORIGIN}${pathname === "/" ? "/" : pathname.replace(/\/+$/, "")}`;
    const imageUrl = image.startsWith("http") ? image : `${SITE_ORIGIN}${image}`;

    document.title = pageTitle.slice(0, 60);
    setMeta("name", "description", pageDescription.slice(0, 160));
    setMeta("name", "keywords", keywords ?? SEO_KEYWORDS_CONTENT);
    setMeta("name", "robots", (noIndex ?? defaults.noIndex) ? "noindex, nofollow" : "index, follow");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", pageTitle.slice(0, 60));
    setMeta("property", "og:description", pageDescription.slice(0, 160));
    setMeta("property", "og:image", imageUrl);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:type", type);
    setMeta("property", "og:image:alt", "Gist me Logo");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", pageTitle.slice(0, 60));
    setMeta("name", "twitter:description", pageDescription.slice(0, 160));
    setMeta("name", "twitter:image", imageUrl);
    setCanonical(canonicalUrl);
  }, [description, image, keywords, noIndex, pathname, title, type]);

  return null;
}
