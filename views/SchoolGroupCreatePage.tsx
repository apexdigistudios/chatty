"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "@/lib/router";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import posthog from "posthog-js";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError } from "@/lib/supabase";
import { createGroup } from "@/services/groupsService";
import { fetchSchool } from "@/services/schoolsService";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import type { School } from "@/types/models";
import { Link } from "@/lib/router";

const GROUP_EMOJIS = ["👥", "🧠", "📚", "🍛", "⚽", "🎤", "🎨", "🔬", "📰", "🏆"] as const;

export function SchoolGroupCreatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const cachedSchool = useGistStore((state) => state.schools.find((school) => school.id === id));
  const [school, setSchool] = useState<School | null>(cachedSchool ?? null);
  const [loadingSchool, setLoadingSchool] = useState(!cachedSchool);
  const [emoji, setEmoji] = useState<string>(GROUP_EMOJIS[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cachedSchool) {
      setSchool(cachedSchool);
      setLoadingSchool(false);
      return;
    }
    if (!id) return;
    let active = true;
    void fetchSchool(id)
      .then((result) => {
        if (active) setSchool(result);
      })
      .catch((error: unknown) => {
        if (active) toast(describeError(error, "School community could not be loaded."), "danger");
      })
      .finally(() => {
        if (active) setLoadingSchool(false);
      });
    return () => {
      active = false;
    };
  }, [cachedSchool, id, toast]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || name.trim().length < 2) return;
    if (!user) {
      openAuthGate({
        title: "Start a campus club",
        speech: "Sign in to create a club for your school.",
        prefillSchoolId: id,
        returnTo: `/schools/${id}/groups/new`,
      });
      return;
    }

    setSaving(true);
    try {
      const group = await createGroup({ schoolId: id, name, description, emoji });
      posthog.capture("group_created", { has_description: Boolean(description.trim()) });
      toast(`${group.emoji} ${group.name} is live!`, "success");
      navigate(`/schools/${id}?tab=groups`);
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setSaving(false);
    }
  };

  if (loadingSchool) {
    return <div className="mx-auto max-w-[760px] px-4 py-12 text-center text-sm font-bold text-ink-muted">Loading school…</div>;
  }
  if (!school) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-12 text-center">
        <p className="text-sm font-bold text-ink">School community not found.</p>
        <Link to="/schools" className="mt-3 inline-flex text-sm font-bold text-brand-deep hover:underline">Back to schools</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] min-w-0 px-4 pt-5 sm:px-6 sm:pt-7">
      <Link to={`/schools/${id}?tab=groups`} className="inline-flex items-center gap-1 text-xs font-extrabold text-ink-muted hover:text-brand-deep">
        <ArrowLeft size={14} aria-hidden />Back to groups
      </Link>
      <PageHeading
        eyebrow={school.shortName}
        title="Create a club"
        description="Give students a space to meet around a shared interest."
      />
      <form onSubmit={submit} className="mt-5 rounded-3xl border-2 border-brand bg-card p-4 shadow-[0_4px_0_var(--brand-edge)] sm:p-6">
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Choose an icon</span>
          <span className="flex flex-wrap gap-1.5">
            {GROUP_EMOJIS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setEmoji(item)}
                aria-pressed={emoji === item}
                aria-label={`Use ${item}`}
                className={`flex size-11 items-center justify-center rounded-xl border-2 text-base ${emoji === item ? "border-brand bg-brand-wash" : "border-line bg-page hover:border-line-deep"}`}
              >
                {item}
              </button>
            ))}
          </span>
        </label>
        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Club name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 48))}
            placeholder="e.g. NSMQ Squad"
            maxLength={48}
            minLength={2}
            required
            className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Description (optional)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 160))}
            placeholder="What is this club about?"
            maxLength={160}
            className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
          />
        </label>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={saving || name.trim().length < 2} leftIcon={saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}>
            {saving ? "Creating…" : "Create club"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/schools/${id}?tab=groups`)}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
