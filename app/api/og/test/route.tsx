import { ImageResponse } from "next/og";
import QRCode from "qrcode";

export async function GET() {
  const qr = await QRCode.toDataURL("https://www.gistme.online/profile/Gistmegodfather");
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", color: "#111827", background: "#ffffff" }}>
      <img src={qr} width="324" height="324" />
    </div>,
    { width: 1200, height: 630 }
  );
}
