"use client";

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@/lib/router";
import { ArrowLeft, ImagePlus, Loader2, Plus, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { formatBytes } from "@/lib/imageCompression";
import { describeError } from "@/lib/supabase";
import { GHANA_REGIONS } from "@/services/schoolsService";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import { SCHOOL_TYPES, schoolTypeLabel, type SchoolType } from "@/types/models";

export function SchoolCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const createSchool = useGistStore((state) => state.createSchool);
  const [form, setForm] = useState<{ name: string; region: string; schoolType: SchoolType }>({
    name: "",
    region: GHANA_REGIONS[0],
    schoolType: "public",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      openAuthGate({
        title: "Found your school community",
        speech: "Sign in to create a school community.",
        returnTo: "/schools/new",
      });
      return;
    }
    if (form.name.trim().length < 3) return;
    setSaving(true);
    try {
      const school = await createSchool({ ...form, logoFile });
      toast(`${school.shortName} is live. You are its moderator.`, "success");
      navigate(`/schools/${school.id}?tab=manage`);
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] min-w-0 px-4 pt-5 sm:px-6 sm:pt-7">
      <Link to="/schools" className="inline-flex items-center gap-1 text-xs font-extrabold text-ink-muted hover:text-brand-deep">
        <ArrowLeft size={14} aria-hidden />All communities
      </Link>
      <PageHeading
        eyebrow="Start a community"
        title="Create a school"
        description="Add your school so students can find and join it."
      />

      <form onSubmit={submit} className="mt-5 rounded-3xl border-2 border-brand bg-card p-4 shadow-[0_4px_0_var(--brand-edge)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand-deep">
            <ShieldCheck size={19} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-black text-ink">Register your SHS</h2>
            <p className="mt-1 text-xs font-semibold text-ink-muted">You will help keep this school community safe.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Full school name</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Ghana National College"
              maxLength={80}
              required
              className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Region</span>
            <select
              value={form.region}
              onChange={(event) => setForm({ ...form, region: event.target.value })}
              className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
            >
              {GHANA_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">School type</span>
            <select
              value={form.schoolType}
              onChange={(event) => setForm({ ...form, schoolType: event.target.value as SchoolType })}
              className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
            >
              {SCHOOL_TYPES.map((type) => <option key={type} value={type}>{schoolTypeLabel(type)}</option>)}
            </select>
          </label>
          <label className="block cursor-pointer">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">School crest (optional)</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border-2 border-dashed border-line bg-page px-3 text-xs font-bold text-ink-muted hover:border-brand">
              <ImagePlus size={16} className="shrink-0 text-brand-deep" aria-hidden />
              <span className="truncate">{logoFile ? `${logoFile.name} (${formatBytes(logoFile.size)})` : "Choose an image"}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  if (!file.type.startsWith("image/")) {
                    toast("Choose an image for the school crest.", "danger");
                    return;
                  }
                  setLogoFile(file);
                }}
              />
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={saving || form.name.trim().length < 3} leftIcon={saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}>
            {saving ? "Creating…" : "Create community"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => navigate("/schools")}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
