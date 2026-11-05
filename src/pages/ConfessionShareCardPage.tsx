import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfessionShareCard, type ConfessionShareCardData } from "../components/share/ConfessionShareCard";
import { Button } from "../components/ui/Button";
import { sharePreviewUrl } from "../lib/shareLinks";
import { fetchApprovedConfession } from "../services/confessionsService";
import { useGistStore } from "../store/gistStore";
import type { Confession } from "../types/models";

export function ConfessionShareCardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const schools = useGistStore((state) => state.schools);
  const [confession, setConfession] = useState<Confession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (!id) throw new Error("This confession link is missing its ID.");
        const result = await fetchApprovedConfession(id);
        if (!result) throw new Error("This confession is no longer available.");
        if (active) setConfession(result);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this confession.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <div className="mx-auto mt-8 h-128 w-[min(100%-2rem,56rem)] animate-pulse rounded-3xl border-2 border-line bg-card" />;
  }
  if (error || !confession) {
    return (
      <div role="alert" className="mx-auto mt-8 max-w-xl rounded-3xl border-2 border-line bg-card px-5 py-10 text-center">
        <p className="text-sm font-extrabold text-ink">{error ?? "This confession is no longer available."}</p>
        <Button className="mt-4" onClick={() => navigate("/confessions")}>Back to confessions</Button>
      </div>
    );
  }

  const school = schools.find((item) => item.id === confession.schoolId);
  const data: ConfessionShareCardData = {
    content: confession.content,
    url: sharePreviewUrl("confession", confession.id),
    schoolName: school?.name ?? "Gist me",
    schoolCrestUrl: school?.crestUrl,
    title: "Anonymous confession on Gist me",
  };

  return <ConfessionShareCard data={data} onBack={() => navigate(`/confessions/${encodeURIComponent(confession.id)}`)} />;
}
