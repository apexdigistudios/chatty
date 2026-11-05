import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { useToast } from "../ui/Toast";

type CardTheme = "pink" | "purple" | "midnight" | "school";

export interface ConfessionShareCardData {
  content: string;
  url: string;
  schoolName: string;
  schoolCrestUrl?: string | null;
  title: string;
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

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of Array.from(word)) {
        const next = line + character;
        if (context.measureText(next).width > maxWidth && line) {
          lines.push(line);
          line = character;
        } else {
          line = next;
        }
      }
    }
    if (line) lines.push(line);
    if (!paragraph) lines.push("");
  }
  return lines.length > 0 ? lines : [""];
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

async function createCardImage(data: ConfessionShareCardData, themeId: CardTheme): Promise<Blob> {
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

  roundedRect(context, 76, 80, 928, 1188, 56);
  context.fillStyle = "rgba(255,255,255,0.96)";
  context.fill();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = theme.end;
  context.font = "800 27px Arial, sans-serif";
  context.fillText("🤫  ANONYMOUS CONFESSION", 540, 160);

  const crest = await loadCrest(data.schoolCrestUrl ?? "");
  context.beginPath();
  context.arc(540, 280, 54, 0, Math.PI * 2);
  context.fillStyle = "#f4f4f5";
  context.fill();
  if (crest) {
    context.save();
    context.beginPath();
    context.arc(540, 280, 48, 0, Math.PI * 2);
    context.clip();
    context.drawImage(crest, 492, 232, 96, 96);
    context.restore();
  } else {
    context.fillStyle = theme.end;
    context.font = "800 35px Arial, sans-serif";
    context.fillText(data.schoolName.slice(0, 3).toUpperCase(), 540, 280);
  }

  context.fillStyle = "#52525b";
  context.font = "700 26px Arial, sans-serif";
  context.fillText(data.schoolName, 540, 370, 800);

  const textTop = 460;
  const textHeight = 570;
  let fontSize = 54;
  let lines: string[] = [];
  let lineHeight = 0;
  for (; fontSize >= 28; fontSize -= 2) {
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    lines = wrapText(context, `“${data.content.replace(/\s+/g, " ").trim()}”`, 790);
    lineHeight = fontSize * 1.3;
    if (lines.length * lineHeight <= textHeight) break;
  }
  context.fillStyle = "#18181b";
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  context.textBaseline = "top";
  const textBlockHeight = lines.length * lineHeight;
  lines.forEach((line, index) => {
    context.fillText(line, 540, textTop + Math.max(0, (textHeight - textBlockHeight) / 2) + index * lineHeight, 790);
  });

  context.textBaseline = "middle";
  context.fillStyle = theme.end;
  context.font = "800 30px Arial, sans-serif";
  context.fillText("Gist me", 540, 1120);
  context.fillStyle = "#71717a";
  context.font = "500 22px Arial, sans-serif";
  context.fillText("Send an anonymous confession", 540, 1165);
  context.font = "500 18px Arial, sans-serif";
  context.fillText("www.gistme.online", 540, 1210);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the share card image."));
    }, "image/png");
  });
}

export function ConfessionShareCard({
  data,
  onBack,
}: {
  data: ConfessionShareCardData;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [themeId, setThemeId] = useState<CardTheme>("purple");
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0]!;
  const cardText = data.content.replace(/\s+/g, " ").trim();
  const estimatedLines = Math.max(1, Math.ceil(cardText.length / 30));
  const previewFontSize = Math.max(12, Math.min(16, 220 / (estimatedLines * 1.2)));

  useEffect(() => {
    let active = true;
    setBusy(true);
    setCardBlob(null);
    void createCardImage(data, themeId).then((blob) => {
      if (active) setCardBlob(blob);
    }).catch((error: unknown) => {
      console.error("Could not create confession share card.", error);
      if (active) toast("Could not render the share card in this browser.", "danger");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [data, themeId, toast]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      toast("Confession link copied.", "success");
    } catch (error) {
      toast("Could not copy the confession link.", "danger");
      console.error("Could not copy confession link.", error);
    }
  };

  const downloadCard = () => {
    if (!cardBlob) {
      toast("The share card is still being prepared.", "danger");
      return;
    }
    const objectUrl = URL.createObjectURL(cardBlob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `gistme-confession-${Date.now()}.png`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const shareToApp = async () => {
    try {
      const file = cardBlob ? new File([cardBlob], "gistme-confession.png", { type: "image/png" }) : null;
      if (typeof navigator.share !== "function") {
        await copyLink();
        return;
      }
      if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: data.title, text: "Send an anonymous confession", url: data.url });
      } else {
        await navigator.share({ title: data.title, text: "Send an anonymous confession", url: data.url });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("Could not open the share sheet.", "danger");
      console.error("Could not share confession card.", error);
    }
  };

  const shareExternal = (destination: "whatsapp" | "x") => {
    const text = "Click to read and reply anonymously.";
    const target = destination === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(`${text} ${data.url}`)}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(data.url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-extrabold text-ink-muted hover:bg-page hover:text-ink">
        <ArrowLeft size={17} aria-hidden /> Back to confession
      </button>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] lg:items-start">
        <section aria-label="Confession card preview" className={`mx-auto flex aspect-4/5 w-full max-w-sm flex-col items-center justify-center rounded-3xl p-4 text-center shadow-xl sm:p-5 ${theme.className}`}>
          <div className="flex h-full w-full min-h-0 flex-col items-center rounded-2xl bg-white/95 p-4 text-zinc-900 sm:p-5">
            <span className="rounded-full bg-violet-100 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-violet-800">🤫 Anonymous Confession</span>
            {data.schoolCrestUrl
              ? <img src={data.schoolCrestUrl} alt="" className="mt-4 size-12 shrink-0 rounded-full border border-zinc-200 object-cover" crossOrigin="anonymous" />
              : <span className="mt-4 flex size-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-black text-violet-800">{data.schoolName.slice(0, 3).toUpperCase()}</span>}
            <p className="mt-2 max-w-full shrink-0 truncate text-[10px] font-bold text-zinc-500">{data.schoolName}</p>
            <p style={{ fontSize: `clamp(0.75rem, ${previewFontSize}px, 1rem)` }} className="mt-4 min-h-0 w-full flex-1 overflow-hidden whitespace-pre-wrap wrap-break-word font-extrabold leading-snug">“{cardText}”</p>
            <p className="mt-2 shrink-0 pt-3 text-xs font-black text-violet-800">Gist me</p>
            <p className="mt-1 shrink-0 text-[9px] font-semibold text-zinc-500">Send an anonymous confession</p>
          </div>
        </section>

        <section className="rounded-3xl border-2 border-line bg-card p-4 sm:p-5">
          <h1 className="text-xl font-black text-ink">Customize your confession card</h1>
          <p className="mt-1 text-xs font-semibold text-ink-muted">Download it for Stories or share the confession link.</p>
          <div className="mt-5">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-ink-muted">Card background</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {THEMES.map((item) => (
                <button key={item.id} type="button" onClick={() => setThemeId(item.id)} aria-pressed={themeId === item.id} className={`rounded-xl p-1 text-[9px] font-extrabold ${themeId === item.id ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""}`}>
                  <span className={`mb-1 block h-8 rounded-lg ${item.className}`} />{item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void copyLink()} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-line px-2 text-xs font-extrabold hover:bg-page">
              <Copy size={14} aria-hidden /> Copy Link
            </button>
            <button type="button" onClick={() => shareExternal("whatsapp")} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-2 text-xs font-extrabold text-white">
              <MessageCircle size={14} aria-hidden /> WhatsApp
            </button>
            <button type="button" onClick={() => shareExternal("x")} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-black px-2 text-xs font-extrabold text-white">𝕏 Share</button>
            <button type="button" disabled={busy} onClick={downloadCard} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-2 text-xs font-extrabold text-white disabled:opacity-50">
              <Download size={14} aria-hidden /> Download Image
            </button>
          </div>
          <button type="button" disabled={busy} onClick={() => void shareToApp()} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-violet-700 px-3 text-xs font-extrabold text-violet-800 hover:bg-violet-50 disabled:opacity-50">
            <Share2 size={15} aria-hidden /> Share to Story / App
          </button>
        </section>
      </div>
    </main>
  );
}
