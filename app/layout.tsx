import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/nunito";
import "@/app/globals.css";
import { AppProviders } from "@/components/AppProviders";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.gistme.online"),
  title: "Gist me | Ghana SHS Social & Study Community",
  description:
    "Gist me is a social and study community for Ghanaian Senior High School students to connect, discover school communities, and share campus stories.",
  applicationName: "Gist me",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }, { url: "/favicon.ico", type: "image/svg+xml" }],
    apple: "/logo.png",
  },
  openGraph: {
    siteName: "Gist me",
    title: "Gist me | Ghana SHS Social & Study Community",
    description:
      "Gist me is a social and study community for Ghanaian Senior High School students to connect, discover school communities, and share campus stories.",
    type: "website",
    url: "https://www.gistme.online/",
    images: [{ url: "/logo.png", alt: "Gist me Logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gist me | Ghana SHS Social & Study Community",
    description:
      "Gist me is a social and study community for Ghanaian Senior High School students to connect, discover school communities, and share campus stories.",
    images: [{ url: "/logo.png", alt: "Gist me Logo" }],
  },
  alternates: { canonical: "https://www.gistme.online/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F4F5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-M7VRV28C"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <Script
          id="google-tag-manager"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-M7VRV28C');
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`,
          }}
        />
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try {
              const mode = localStorage.getItem("lets-gist-theme") || "system";
              const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
              document.documentElement.classList.toggle("dark", dark);
              document.documentElement.dataset.theme = dark ? "dark" : "light";
              document.documentElement.style.colorScheme = dark ? "dark" : "light";
              document.querySelector('meta[name="theme-color"]').content = dark ? "#121215" : "#F4F4F5";
            } catch (_) {}`,
          }}
        />
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
