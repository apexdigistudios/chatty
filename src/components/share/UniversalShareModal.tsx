import { useEffect, useState } from "react";
import { Copy, Download, MessageCircle, Share2, X } from "lucide-react";
import { useToast } from "../ui/Toast";

type CardTheme = "pink" | "purple" | "midnight" | "school";

export interface ShareCardData {
  kind: "post" | "confession";
  content: string;
  url: string;
  schoolName: string;
  schoolCrestUrl?: string | null;
  title?: string;
  onShared?: () => void;
}

const THEMES: Array<{ id: CardTheme; label: string; className: string; start: string; end: string }> = [
  { id: "pink", label: "Hot Pink", className: "bg-gradient-to-br from-pink-500 to-rose-700", start: "#ec4899", end: "#be123c" },
  { id: "purple", label: "Neon Purple", className: "bg-gradient-to-br from-violet-500 to-indigo-800", start: "#8b5cf6", end: "#3730a3" },
  { id: "midnight", label: "Midnight", className: "bg-gradient-to-br from-neutral-800 to-black", start: "#27272a", end: "#09090b" },
  { id: "school", label: "School Colors", className: "bg-gradient-to-br from-amber-400 to-emerald-800", start: "#f59e0b", end: "#065f46" },
];

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  visible.forEach((value, index) => {
    const isLastTrimmedLine = index === maxLines - 1 && lines.length > maxLines;
    context.fillText(isLastTrimmedLine ? `${value.slice(0, Math.max(0, value.length - 3))}…` : value, x, y + index * lineHeight, maxWidth);
  });
}

async function loadCrest(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function createCardImage(data: ShareCardData, themeId: CardTheme): Promise<Blob> {
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0]!;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is not supported in this browser.");

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, theme.start);
  gradient.addColorStop(1, theme.end);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.1;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(970, 130, 300, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  roundedRect(context, 76, 110, 928, 1128, 56);
  context.fillStyle = "rgba(255,255,255,0.96)";
  context.fill();

  const confession = data.kind === "confession";
  context.textAlign = "center";
  context.fillStyle = theme.end;
  context.font = "800 27px Arial, sans-serif";
  context.fillText(confession ? "🤫  ANONYMOUS CONFESSION" : "A GIST FROM GIST ME", 540, 195);

  const crest = await loadCrest(data.schoolCrestUrl ?? "");
  context.beginPath();
  context.arc(540, 310, 54, 0, Math.PI * 2);
  context.fillStyle = "#f4f4f5";
  context.fill();
  if (crest) {
    context.save();
    context.beginPath();
    context.arc(540, 310, 48, 0, Math.PI * 2);
    context.clip();
    context.drawImage(crest, 492, 262, 96, 96);
    context.restore();
  } else {
    context.fillStyle = theme.end;
    context.font = "800 35px Arial, sans-serif";
    context.fillText(data.schoolName.slice(0, 3).toUpperCase(), 540, 322);
  }

  context.fillStyle = "#52525b";
  context.font = "700 26px Arial, sans-serif";
  context.fillText(data.schoolName, 540, 404, 800);

  context.fillStyle = "#18181b";
  context.font = "700 51px Arial, sans-serif";
  drawWrappedText(context, `“${data.content}”`, 540, 525, 790, 70, 7);

  context.fillStyle = theme.end;
  context.font = "800 30px Arial, sans-serif";
  context.fillText("Gist me", 540, 1100);
  context.fillStyle = "#71717a";
  context.font = "500 22px Arial, sans-serif";
  context.fillText(confession ? "Send an anonymous confession" : "Join your school conversation", 540, 1145);
  context.font = "500 18px Arial, sans-serif";
  context.fillText("www.gistme.online", 540, 1190);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the share card image."));
    }, "image/png");
  });
}

export function UniversalShareModal({
  data,
  onClose,
}: {
  data: ShareCardData;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [themeId, setThemeId] = useState<CardTheme>("purple");
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0]!;
  const isConfession = data.kind === "confession";
  const title = data.title ?? (isConfession ? "Anonymous confession on Gist me" : `Gist from ${data.schoolName}`);
  const text = isConfession ? "Click to read and reply anonymously on Gist me." : data.content.slice(0, 160);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setCardBlob(null);
    void createCardImage(data, themeId).then((blob) => {
      if (active) setCardBlob(blob);
    }).catch((error: unknown) => {
      console.error("Could not create share card preview.", error);
      if (active) toast("Could not render the share card in this browser.", "danger");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [data.kind, data.content, data.schoolName, data.schoolCrestUrl, data.url, themeId, toast]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      toast("Share link copied.", "success");
      data.onShared?.();
    } catch (error) {
      toast("Could not copy the share link.", "danger");
      console.error("Could not copy share link.", error);
    }
  };

  const downloadCard = async () => {
    try {
      if (!cardBlob) throw new Error("The share card is still being prepared.");
      const objectUrl = URL.createObjectURL(cardBlob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${isConfession ? "gistme-confession" : "gistme-gist"}-${Date.now()}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast("Share card downloaded.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download the share card.", "danger");
      console.error("Could not create share card.", error);
    }
  };

  const shareToApp = async () => {
    try {
      if (typeof navigator.share !== "function") {
        await copyLink();
        return;
      }
      const file = cardBlob ? new File([cardBlob], "gistme-share.png", { type: "image/png" }) : null;
      if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text, url: data.url });
      } else {
        await navigator.share({ title, text, url: data.url });
      }
      data.onShared?.();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("Could not open the share sheet.", "danger");
      console.error("Could not share content.", error);
    }
  };

  const shareExternal = (destination: "whatsapp" | "x") => {
    const shareText = `${text} ${data.url}`;
    const target = destination === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(shareText)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(data.url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
    data.onShared?.();
  };

  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-line bg-card p-4 text-ink shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="share-dialog-title" className="text-lg font-black">Share {isConfession ? "confession" : "gist"}</h2>
            <p className="mt-0.5 text-xs font-semibold text-ink-muted">Preview your card or choose where to share it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share dialog" className="flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-page"><X size={19} aria-hidden /></button>
        </div>

        <div className={`mx-auto flex aspect-4/5 max-h-[45dvh] max-w-xs flex-col items-center justify-center rounded-3xl p-4 text-center shadow-xl ${theme.className}`}>
          <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-white/95 p-5 text-zinc-900">
            <span className="rounded-full bg-violet-100 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-violet-800">
              {isConfession ? "🤫 Anonymous Confession" : "A Gist from Gist me"}
            </span>
            {data.schoolCrestUrl ? <img src={data.schoolCrestUrl} alt="" className="mt-4 size-12 rounded-full border border-zinc-200 object-cover" crossOrigin="anonymous" /> : <span className="mt-4 flex size-12 items-center justify-center rounded-full bg-zinc-100 text-xs font-black text-violet-800">{data.schoolName.slice(0, 3).toUpperCase()}</span>}
            <p className="mt-2 max-w-full truncate text-[10px] font-bold text-zinc-500">{data.schoolName}</p>
            <p className="mt-4 line-clamp-7 w-full whitespace-pre-wrap wrap-break-word text-sm font-extrabold leading-relaxed sm:text-base">“{data.content}”</p>
            <p className="mt-auto pt-4 text-xs font-black text-violet-800">Gist me</p>
            <p className="mt-1 text-[9px] font-semibold text-zinc-500">{isConfession ? "Send an anonymous confession" : "Join your school conversation"}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-muted">Card background</p>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((item) => (
              <button key={item.id} type="button" onClick={() => setThemeId(item.id)} aria-pressed={themeId === item.id} className={`rounded-xl p-1 text-[9px] font-extrabold ${themeId === item.id ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""}`}>
                <span className={`mb-1 block h-8 rounded-lg ${item.className}`} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" disabled={busy} onClick={() => void copyLink()} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-line px-2 text-xs font-extrabold hover:bg-page disabled:opacity-50">
            <Copy size={14} aria-hidden /> Copy Link
          </button>
          <button type="button" disabled={busy} onClick={() => shareExternal("whatsapp")} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-2 text-xs font-extrabold text-white disabled:opacity-50">
            <MessageCircle size={14} aria-hidden /> WhatsApp
          </button>
          <button type="button" disabled={busy} onClick={() => shareExternal("x")} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-black px-2 text-xs font-extrabold text-white disabled:opacity-50">
            𝕏 Share
          </button>
          <button type="button" disabled={busy} onClick={() => void downloadCard()} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-2 text-xs font-extrabold text-white disabled:opacity-50">
            <Download size={14} aria-hidden /> {isConfession ? "Download Image" : "Download Card"}
          </button>
        </div>
        <button type="button" disabled={busy} onClick={() => void shareToApp()} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-violet-700 px-3 text-xs font-extrabold text-violet-800 hover:bg-violet-50 disabled:opacity-50">
          <Share2 size={15} aria-hidden /> Share to Story / App
        </button>
      </section>
    </div>
  );
}
