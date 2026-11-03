import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import { useToast } from "../ui/Toast";
import { describeError } from "../../lib/supabase";
import { uploadSchoolLogo, type SchoolLogoUploadStage } from "../../lib/images/imageUpload";
import { cn } from "../../utils/cn";

interface SchoolCrestUploaderProps {
  schoolId: string;
  canEdit: boolean;
  onUploaded: (logoUrl: string) => void;
}

const stageLabel: Record<SchoolLogoUploadStage, string> = {
  compressing: "Compressing crest…",
  uploading: "Uploading crest…",
  saving: "Saving crest…",
};

export function SchoolCrestUploader({
  schoolId,
  canEdit,
  onUploaded,
}: SchoolCrestUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [stage, setStage] = useState<SchoolLogoUploadStage | null>(null);
  const [dragging, setDragging] = useState(false);

  if (!canEdit) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose an image file for the school crest.", "danger");
      return;
    }

    try {
      const logoUrl = await uploadSchoolLogo(schoolId, file, setStage);
      onUploaded(logoUrl);
      toast("School crest updated.", "success");
    } catch (error) {
      toast(describeError(error, "Could not update the school crest."), "danger");
    } finally {
      setStage(null);
      setDragging(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    void upload(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (stage) return;
    void upload(event.dataTransfer.files[0]);
  };

  const busy = stage !== null;

  return (
    <div
      className="absolute inset-0 z-10 rounded-full"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={onDrop}
    >
      <button
        type="button"
        aria-label={busy ? stageLabel[stage] : "Update school crest"}
        title={busy ? stageLabel[stage] : "Update school crest"}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "absolute bottom-0 right-0 z-20 flex size-11 items-center justify-center rounded-full border-2 border-card bg-black/70 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-wait",
          dragging && "ring-4 ring-brand"
        )}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : (
          <Camera size={18} strokeWidth={2.6} aria-hidden />
        )}
      </button>
      {busy && (
        <span className="absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[10px] font-extrabold text-card shadow-lg">
          {stageLabel[stage]}
        </span>
      )}
      {dragging && !busy && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-full bg-brand/80 text-[9px] font-black uppercase tracking-wide text-white">
          Drop crest
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a new school crest"
        onChange={onFileChange}
        disabled={busy}
      />
    </div>
  );
}
