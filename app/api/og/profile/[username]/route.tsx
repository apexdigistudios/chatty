import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import sharp from "sharp";
import { fetchPublicProfileData } from "@/lib/publicContent.server";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import { PROFILE_SHARE_HOOKS } from "@/lib/profileShareContent";

export const runtime = "nodejs";
const OG_SIZE = { width: 1200, height: 630 };

type RouteContext = { params: Promise<{ username: string }> };

async function loadImageDataUrl(source: string | null): Promise<string | null> {
  if (!source) return null;
  try {
    const response = await fetch(cloudflareMediaUrl(source), { signal: AbortSignal.timeout(2500) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 4 * 1024 * 1024) return null;
    const png = await sharp(bytes).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.warn("Could not load a profile image for the social preview.", error);
    return null;
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { username } = await params;
  const profile = await fetchPublicProfileData(username);
  if (!profile) return new Response("Profile not found", { status: 404 });

  const profileUrl = `https://www.gistme.online/profile/${encodeURIComponent(profile.username)}`;
  const qrCode = await QRCode.toDataURL(profileUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#111827", light: "#FFFFFF" },
  });

  const [avatarDataUrl, schoolCrestDataUrl] = await Promise.all([
    loadImageDataUrl(profile.avatarUrl),
    loadImageDataUrl(profile.schoolCrest),
  ]);
  const displayName = profile.fullName?.trim() || `@${profile.username}`;
  const initials = displayName.slice(0, 2).toUpperCase();
  const schoolName = profile.schoolName || "Campus community";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "58px 76px",
          background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #f5f3ff 100%)",
          color: "#111827",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ width: 680, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 24, fontWeight: 800, color: "#4338ca", letterSpacing: 2 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, marginRight: 10, borderRadius: 15, background: "#fff7ed" }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: "#f97316" }} />
            </span>
            GIST ME
            <span style={{ marginLeft: 16, color: "#64748b", fontSize: 14, letterSpacing: 1 }}>GHANA SHS COMMUNITY</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: 48 }}>
            {avatarDataUrl ? (
              <img src={avatarDataUrl} width={138} height={138} style={{ borderRadius: 69, objectFit: "cover", border: "6px solid white" }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 138, height: 138, borderRadius: 69, background: "#312e81", color: "#fff", fontSize: 42, fontWeight: 800 }}>
                {initials}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", marginLeft: 28, maxWidth: 470 }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 42, fontWeight: 800 }}>
                {displayName}
                {profile.isVerified && (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 25, height: 25, marginLeft: 12, borderRadius: 13, background: "#2563eb" }}>
                    <span style={{ width: 10, height: 6, borderLeft: "2px solid white", borderBottom: "2px solid white", transform: "rotate(-45deg)" }} />
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 10, color: "#64748b", fontSize: 21, fontWeight: 600 }}>
                @{profile.username}
                <span style={{ margin: "0 10px", color: "#cbd5e1" }}>·</span>
                {schoolCrestDataUrl ? (
                  <img src={schoolCrestDataUrl} width={26} height={26} style={{ marginRight: 8, borderRadius: 5, objectFit: "cover" }} />
                ) : (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, marginRight: 8, borderRadius: 5, background: "#e0e7ff", color: "#4338ca", fontSize: 12, fontWeight: 800 }}>S</span>
                )}
                <span style={{ color: "#3730a3", fontSize: 16, fontWeight: 800 }}>{schoolName}</span>
              </div>
              <div style={{ marginTop: 12, color: "#475569", fontSize: 17, fontWeight: 500 }}>
                {profile.bio?.trim().slice(0, 100) || "Campus stories, student life and your community."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 18 }}>
            {PROFILE_SHARE_HOOKS.map((hook) => (
              <div key={hook} style={{ display: "flex", alignItems: "center", color: "#334155", fontSize: 17, fontWeight: 700 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 19, height: 19, marginRight: 10, borderRadius: 10, background: "#dcfce7", color: "#15803d", fontSize: 13, fontWeight: 900 }}>✓</span>
                {hook}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, color: "#4338ca", fontSize: 16, fontWeight: 700 }}>SCAN TO OPEN PROFILE | gistme.online</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 360, height: 360, padding: 18, borderRadius: 28, background: "white", boxShadow: "0 18px 55px rgba(30, 41, 59, 0.16)" }}>
          <img src={qrCode} width={324} height={324} />
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
