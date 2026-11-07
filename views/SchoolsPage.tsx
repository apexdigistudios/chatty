'use client';

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@/lib/router";
import { ImagePlus, List, Loader2, MapPin, Plus, Search, ShieldCheck, Users, WifiOff, X } from "lucide-react";
import { PageHeading } from "@/components/layout/PageHeading";
import { formatCompactNumber } from "@/lib/utils";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { formatBytes } from "@/lib/imageCompression";
import { describeError } from "@/lib/supabase";
import { useAuthGateStore } from "@/store/authGateStore";
import { springs } from "@/theme/tokens";
import { useGistStore } from "@/store/gistStore";
import { SCHOOL_TYPES, schoolTypeLabel, type SchoolType } from "@/types/models";
import { cn } from "@/utils/cn";
import { GHANA_REGIONS } from "@/services/schoolsService";
import type { School } from "@/types/models";

/** SHS directory + "create a community" flow (the creator becomes its moderator). */
export function SchoolsPage({
  initialSchools,
  initialSchoolsError = null,
}: {
  initialSchools?: School[] | null;
  initialSchoolsError?: string | null;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const storeSchools = useGistStore((state) => state.schools);
  const schoolsHasLoaded = useGistStore((state) => state.schoolsHasLoaded);
  const schools = storeSchools.length > 0 ? storeSchools : initialSchools ?? [];
  const schoolsLoading = useGistStore((state) => state.schoolsLoading);
  const schoolsError = useGistStore((state) => state.schoolsError);
  const loadSchools = useGistStore((state) => state.loadSchools);
  const createSchool = useGistStore((state) => state.createSchool);

  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("All regions");
  const [typeFilter, setTypeFilter] = useState<SchoolType | "All">("All");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; region: string; schoolType: SchoolType }>({
    name: "",
    region: GHANA_REGIONS[0],
    schoolType: "public",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const directoryError = schoolsError ?? (!schoolsHasLoaded ? initialSchoolsError : null);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const regions = useMemo(() => ["All regions", ...Array.from(new Set(schools.map((school) => school.region))).sort()], [schools]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schools.filter((school) => {
      const matchesQuery = !q || `${school.name} ${school.shortName} ${school.region} ${school.schoolType}`.toLowerCase().includes(q);
      const matchesRegion = region === "All regions" || school.region === region;
      const matchesType = typeFilter === "All" || school.schoolType === typeFilter;
      return matchesQuery && matchesRegion && matchesType;
    });
  }, [query, region, schools, typeFilter]);

  const openCreate = () => {
    if (!user) {
      openAuthGate({
        title: "Found Your SHS Community!",
        speech:
          "Create your student pass first — whoever registers a new SHS community becomes its primary campus moderator!",
        returnTo: "/schools",
      });
      return;
    }
    setCreating(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.name.trim().length < 3) return;
    setSaving(true);
    try {
      const school = await createSchool({ ...form, logoFile });
      toast(`${school.shortName} is live — you are its moderator.`, "success");
      setCreating(false);
      setForm({ name: "", region: GHANA_REGIONS[0], schoolType: "public" });
      setLogoFile(null);
      navigate(`/schools/${school.id}?tab=manage`);
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[860px] min-w-0 px-4 pt-5 sm:px-6 sm:pt-7">
      <PageHeading
        eyebrow="Find your people"
        title="School Communities"
        description="A scannable directory of Ghanaian SHS communities. Open a feed, join a campus, or found a new one."
        action={<Button size="sm" leftIcon={<Plus size={14} strokeWidth={2.8} aria-hidden />} onClick={openCreate}>Create</Button>}
      />

      <AnimatePresence initial={false}>
        {creating && (
          <motion.form
            onSubmit={submit}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.gentle}
            className="mb-5 overflow-hidden"
          >
            <div className="rounded-3xl border-2 border-brand bg-card p-4 shadow-[0_4px_0_var(--brand-edge)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep"><ShieldCheck size={12} strokeWidth={2.8} aria-hidden />Found a community</p>
                  <h2 className="mt-1 text-lg font-black tracking-tight text-ink">Register your SHS</h2>
                  <p className="text-xs font-semibold text-ink-muted">You become the primary moderator for every gist tagged to this school.</p>
                </div>
                <button type="button" onClick={() => setCreating(false)} aria-label="Close" className="flex size-11 items-center justify-center rounded-xl border-2 border-line text-ink-muted hover:text-ink"><X size={16} strokeWidth={2.6} aria-hidden /></button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Full school name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Ghana National College" maxLength={80} required />
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Region</span>
                  <select value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} className="h-10 w-full rounded-xl border-2 border-line bg-page px-3 text-xs font-bold text-ink outline-none focus:border-brand">
                    {GHANA_REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">School type</span>
                  <select value={form.schoolType} onChange={(event) => setForm({ ...form, schoolType: event.target.value as SchoolType })} className="h-10 w-full rounded-xl border-2 border-line bg-page px-3 text-xs font-bold text-ink outline-none focus:border-brand">
                    {SCHOOL_TYPES.map((item) => <option key={item} value={item}>{schoolTypeLabel(item)}</option>)}
                  </select>
                </label>
                <label className="block cursor-pointer">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Crest (optional)</span>
                  <span className="flex h-11 items-center gap-2 rounded-xl border-2 border-dashed border-line bg-page px-3 text-xs font-bold text-ink-muted transition-colors hover:border-brand">
                    <ImagePlus size={15} strokeWidth={2.5} className="shrink-0 text-brand-deep" aria-hidden />
                    <span className="truncate">
                      {logoFile
                        ? `${logoFile.name} (${formatBytes(logoFile.size)})`
                        : "Upload logo (auto WebP)"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (event) => {
                        const raw = event.target.files?.[0];
                        event.target.value = "";
                        if (!raw) return;
                        if (!raw.type.startsWith("image/")) {
                          toast("Choose an image file for the school logo.", "danger");
                          return;
                        }
                        setLogoFile(raw);
                        toast("Logo selected. It will be compressed and uploaded when the community is created.", "brand");
                      }}
                    />
                  </span>
                </label>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button type="submit" size="sm" disabled={saving || form.name.trim().length < 3} leftIcon={saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} strokeWidth={2.8} aria-hidden />}>
                  {saving ? "Creating" : "Create community"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <label className="flex h-12 items-center gap-3 rounded-2xl border-2 border-line bg-card px-3.5 transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
        <Search size={19} strokeWidth={2.5} className="shrink-0 text-ink-muted" aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search school name, region or type" aria-label="Search schools" className="min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink-faint" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-page hover:text-ink"><X size={15} strokeWidth={2.6} aria-hidden /></button>}
      </label>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter by region">
        {regions.map((item) => (
          <button key={item} type="button" onClick={() => setRegion(item)} aria-pressed={region === item} className={cn("min-h-11 rounded-full border-2 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-colors", region === item ? "border-ink bg-ink text-card dark:border-brand-deep dark:bg-brand-deep dark:text-brand-contrast" : "border-line bg-card text-ink-muted hover:border-line-deep hover:text-ink")}>
            {item}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap gap-2" aria-label="Filter by type">
          {(["All", ...SCHOOL_TYPES] as Array<SchoolType | "All">).map((item) => (
            <button key={item} type="button" onClick={() => setTypeFilter(item)} aria-pressed={typeFilter === item} className={cn("min-h-11 rounded-full border-2 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-colors", typeFilter === item ? "border-brand-deep bg-brand-wash text-brand-deep" : "border-line bg-card text-ink-muted hover:border-line-deep hover:text-ink")}>
              {item === "All" ? "All" : schoolTypeLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 mt-6 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-ink sm:text-base" aria-live="polite">
          <List size={15} strokeWidth={2.7} className="text-brand-deep" aria-hidden />
          {directoryError && initialSchools == null ? "Communities unavailable" : `${results.length} communities`}
        </h2>
        {!(directoryError && initialSchools == null) && <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          <span className="inline-flex items-center gap-1"><Users size={12} strokeWidth={2.5} aria-hidden />{formatCompactNumber(results.reduce((sum, school) => sum + school.memberCount, 0))} students</span>
          <span className="inline-flex items-center gap-1"><MapPin size={12} strokeWidth={2.5} aria-hidden />{formatCompactNumber(results.reduce((sum, school) => sum + school.postCount, 0))} gists</span>
        </div>}
      </div>

      {directoryError && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-danger-soft bg-danger-wash px-3.5 py-3">
          <WifiOff size={16} className="shrink-0 text-danger-deep" aria-hidden />
          <p className="min-w-0 flex-1 text-xs font-semibold text-danger-deep">{directoryError}</p>
          <Button size="sm" variant="outline" onClick={() => void loadSchools()}>Retry</Button>
        </div>
      )}

      {schoolsLoading && schools.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-3xl border-2 border-line bg-card motion-reduce:animate-none" />)}
        </div>
      ) : results.length > 0 ? (
        <div className="flex flex-col gap-3">
          {results.map((school) => <SchoolCard key={school.id} school={school} view="list" />)}
        </div>
      ) : directoryError ? null : (
        <div className="rounded-2xl border-2 border-dashed border-line px-5 py-12 text-center">
          <p className="text-sm font-extrabold text-ink">No communities found</p>
          <p className="mx-auto mt-1 max-w-[30ch] text-xs font-semibold leading-relaxed text-ink-muted">Can&apos;t see your school? Found its community and become the moderator.</p>
          <Button size="sm" className="mt-4" onClick={openCreate}>Create community</Button>
        </div>
      )}

      <p className="mx-auto mt-8 max-w-[46ch] pb-8 text-center text-[11px] font-semibold leading-relaxed text-ink-muted">
        Cross-school interaction stays open — you can comment on gists from every SHS while your own founder keeps your campus feed clean.
      </p>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, maxLength, required }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; maxLength: number; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-ink-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} required={required} className="h-10 w-full rounded-xl border-2 border-line bg-page px-3 text-xs font-bold text-ink outline-none placeholder:text-ink-faint focus:border-brand" />
    </label>
  );
}
