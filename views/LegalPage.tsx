'use client';

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Link } from "@/lib/router";

type LegalPageKind = "privacy" | "terms";

type LegalSection = { title: string; paragraphs: string[] };

const pageContent: Record<LegalPageKind, { title: string; description: string; sections: LegalSection[] }> = {
  privacy: {
    title: "Privacy Policy",
    description: "How GistMe collects, uses, protects, and deletes information when you use gistme.online.",
    sections: [
      {
        title: "Information we use",
        paragraphs: [
          "GistMe processes account and profile information, including details you provide and information needed to operate sign-in, student profiles, and school-community features. Profile details and content you choose to publish may be visible to other users.",
          "Gists, comments, reports, and moderation activity are processed to provide community features, respond to reports, and help keep the platform safe. Do not post passwords, private contact details, or information you do not want shared.",
        ],
      },
      {
        title: "Google User Data & OAuth Disclosure",
        paragraphs: [
          "When you choose to sign in to GistMe using Google OAuth, GistMe accesses only your basic Google profile information: your email address, full name, profile picture URL, and Google account ID for authentication. GistMe does not access Gmail, Google Contacts, Drive, Calendar, or any sensitive Google scopes.",
          "We use this Google user data strictly to create and authenticate your GistMe account, pre-fill your initial profile display name and avatar, link your account to your school community, and send essential account and security notifications. Google user data is never used for advertising or profiling.",
          "GistMe does not sell, rent, or trade Google user data to third parties. It is processed only by essential infrastructure providers needed to run the service—Supabase for database and authentication hosting and Vercel for web hosting—under data protection agreements, or when disclosure is required by law.",
          "Data is transmitted over encrypted HTTPS/TLS connections and stored in encrypted PostgreSQL databases hosted on Supabase with Row-Level Security (RLS) policies. Access tokens are handled securely and credentials are not exposed to the public.",
          "Google user data is retained only while your GistMe account remains active. You can delete your account in GistMe Account Settings; this permanently purges your profile and associated personal records from our database. Alternatively, email a deletion request to hello.gistme@gmail.com. Requests submitted by email are honored within 7 days.",
          "GistMe's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
        ],
      },
      {
        title: "Questions and requests",
        paragraphs: [
          "For questions about this policy, your account, or your information, contact hello.gistme@gmail.com.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    description: "The terms and community expectations for using GistMe and participating in school communities.",
    sections: [
      {
        title: "Use the community responsibly",
        paragraphs: [
          "Use GistMe lawfully and respectfully. Harassment, threats, hate, scams, impersonation, privacy violations, and other harmful or disruptive content may be reported and reviewed.",
        ],
      },
      {
        title: "Your posts",
        paragraphs: [
          "You are responsible for content you submit. Do not share another person's private information or content you do not have permission to publish. Posts may be hidden or removed when reviewed under community-safety processes.",
        ],
      },
      {
        title: "Spotlight and moderation",
        paragraphs: [
          "Promoted gists are subject to automated screening and may be held for review. Payment authorization alone does not guarantee that a promotion will go live.",
        ],
      },
      {
        title: "Questions",
        paragraphs: [
          "If you need help with your account or a community-safety decision, contact hello.gistme@gmail.com.",
        ],
      },
    ],
  },
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const content = pageContent[kind];
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="border-b border-line/70 bg-card/80">
        <div className="mx-auto flex min-h-16 w-full max-w-[900px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg text-sm font-black text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">
            <BrandLogo className="size-8 rounded-lg object-contain" />
            <span>GistMe</span>
          </Link>
          <Link to="/" className="text-xs font-bold text-ink-muted underline-offset-4 hover:text-brand-deep hover:underline">
            Back to App
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-deep">GistMe · gistme.online</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-ink sm:text-4xl">{content.title}</h1>
        <p className="mt-3 text-sm font-semibold leading-7 text-ink-muted">{content.description}</p>
        <div className="mt-7 divide-y divide-line rounded-3xl border border-line bg-card px-5 sm:px-7">
          {content.sections.map((section) => (
            <section key={section.title} className="py-5 first:pt-6 last:pb-6">
              <h2 className="text-base font-black text-ink">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-2 text-sm font-semibold leading-7 text-ink-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
        <nav aria-label="Legal pages" className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold text-ink-muted">
          <Link to={kind === "privacy" ? "/terms" : "/privacy"} className="text-brand-deep underline underline-offset-4">
            {kind === "privacy" ? "Terms of Service" : "Privacy Policy"}
          </Link>
          <Link to="/" className="underline underline-offset-4 hover:text-brand-deep">Back to GistMe</Link>
        </nav>
      </main>
    </div>
  );
}
