'use client';

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { downloadImage } from "@/lib/download";
import { useToast } from "@/components/ui/Toast";

interface DownloadImageButtonProps {
  src: string;
  filename: string;
  className?: string;
}

export function DownloadImageButton({ src, filename, className = "" }: DownloadImageButtonProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadImage(src, filename);
      toast("Image downloaded.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download image.", "danger");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void download();
      }}
      disabled={downloading}
      aria-label={downloading ? "Downloading image" : "Download image"}
      aria-busy={downloading}
      className={`flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white shadow-lg backdrop-blur transition hover:bg-black disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 ${className}`}
    >
      {downloading
        ? <Loader2 size={17} className="animate-spin" aria-hidden />
        : <Download size={17} strokeWidth={2.6} aria-hidden />}
    </button>
  );
}
