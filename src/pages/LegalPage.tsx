import { Link } from "react-router-dom";
import { PageHeading } from "../components/layout/PageHeading";
import { Card } from "../components/ui/Card";

type LegalPageKind = "privacy" | "terms";

const pageContent: Record<LegalPageKind, { title: string; description: string; sections: Array<{ title: string; body: string }> }> = {
  privacy: {
    title: "Privacy Information",
    description: "A plain-language overview of information shared through Gist me.",
    sections: [
      {
        title: "Account and profile information",
        body: "Gist me uses account and profile information to provide sign-in, student profiles, and school-community features. Profile details you choose to publish may be visible to other users.",
      },
      {
        title: "Posts and community safety",
        body: "Gists, comments, reports, and moderation activity are processed to operate community features and help keep the platform safe. Do not post passwords, private contact details, or information you do not want shared.",
      },
      {
        title: "Questions",
        body: "For questions about your account or information, contact the Gist me team through the support options available in the app.",
      },
    ],
  },
  terms: {
    title: "Terms of Use",
    description: "Guidelines for using Gist me and participating in school communities.",
    sections: [
      {
        title: "Use the community responsibly",
        body: "Use Gist me lawfully and respectfully. Harassment, threats, hate, scams, impersonation, privacy violations, and other harmful or disruptive content may be reported and reviewed.",
      },
      {
        title: "Your posts",
        body: "You are responsible for content you submit. Do not share another person's private information or content you do not have permission to publish. Posts may be hidden or removed when reviewed under community-safety processes.",
      },
      {
        title: "Spotlight and moderation",
        body: "Promoted gists are subject to automated screening and may be held for review. Payment authorization alone does not guarantee that a promotion will go live.",
      },
      {
        title: "Questions",
        body: "If you need help with your account or a community-safety decision, use the support options available in the app.",
      },
    ],
  },
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const content = pageContent[kind];
  return (
    <main className="mx-auto w-full max-w-[760px] min-w-0 px-4 py-6 sm:px-6 sm:py-9">
      <PageHeading eyebrow="Gist me" title={content.title} description={content.description} />
      <Card className="divide-y-2 divide-line px-5 sm:px-7">
        {content.sections.map((section) => (
          <section key={section.title} className="py-5 first:pt-6 last:pb-6">
            <h2 className="text-base font-black text-ink">{section.title}</h2>
            <p className="mt-2 text-sm font-semibold leading-7 text-ink-muted">{section.body}</p>
          </section>
        ))}
      </Card>
      <p className="mt-5 text-center text-sm font-bold text-ink-muted">
        Return to <Link to="/" className="text-brand-deep underline underline-offset-4">Gist me</Link>.
      </p>
    </main>
  );
}
