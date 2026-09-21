import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type SiteIdentity = {
  siteTitle: string;
  siteTagline: string;
  siteDescription: string;
  footerBrand: string;
  footerText: string;
  footerNote: string;
  logoUrl: string | null;
  faviconUrl: string | null;
};

const DEFAULT: SiteIdentity = {
  siteTitle: "ProposalHub",
  siteTagline: "Marketplace Proposal Bisnis Indonesia",
  siteDescription: "ProposalHub: Marketplace proposal bisnis terpercaya. Temukan, beli, dan jual proposal bisnis berkualitas tinggi.",
  footerBrand: "ProposalHub",
  footerText: "Marketplace proposal bisnis terpercaya Indonesia",
  footerNote: "Platform mengambil 35% per transaksi. Seller mendapat 65%.",
  logoUrl: null,
  faviconUrl: null,
};

export const SITE_IDENTITY_KEY = ["site-identity"];

async function fetchIdentity(): Promise<SiteIdentity> {
  const r = await fetch(`${BASE}/api/pm/identity`, { credentials: "include" });
  if (!r.ok) return DEFAULT;
  const data = (await r.json()) as Partial<SiteIdentity>;
  return { ...DEFAULT, ...data };
}

export function useSiteIdentity(): SiteIdentity {
  const { data } = useQuery({
    queryKey: SITE_IDENTITY_KEY,
    queryFn: fetchIdentity,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name"): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    if (!content) return;
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

const DEFAULT_FAVICON = "/favicon.svg";

function setFavicon(href: string | null): void {
  const existing = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]');
  existing.forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href ?? DEFAULT_FAVICON;
  document.head.appendChild(link);
}

/** Applies identity (title, meta description, favicon) to <head>. Mount once at app root. */
export function useApplySiteIdentity(): void {
  const identity = useSiteIdentity();
  useEffect(() => {
    const title = identity.siteTagline
      ? `${identity.siteTitle} — ${identity.siteTagline}`
      : identity.siteTitle;
    document.title = title;
    setMeta("description", identity.siteDescription);
    setMeta("og:title", title, "property");
    setMeta("og:description", identity.siteDescription, "property");
    setFavicon(identity.faviconUrl);
  }, [identity.siteTitle, identity.siteTagline, identity.siteDescription, identity.faviconUrl]);
}
