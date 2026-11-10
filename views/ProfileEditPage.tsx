'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import posthog from "posthog-js";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { useNavigate } from "@/lib/router";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import {
  COMPRESSION_PRESETS,
  compressImageWithStats,
  formatBytes,
} from "@/lib/imageCompression";
import { describeError } from "@/lib/supabase";
import {
  checkUsernameAvailable,
  isValidUsername,
  updateMyProfile,
  uploadMyAvatar,
} from "@/services/profilesService";
import { cn } from "@/utils/cn";

type UsernameAvailability = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

export function ProfileEditPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading, setProfile } = useAuth();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [fullName, setFullName] = useState("");
  const [classForm, setClassForm] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [availability, setAvailability] = useState<UsernameAvailability>("idle");
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setBio(profile.bio);
    setWebsite(profile.website ?? "");
    setFullName(profile.fullName ?? "");
    setClassForm(profile.classForm ?? "");
    setAvatarUrl(profile.avatarUrl);
  }, [profile]);

  useEffect(() => {
    if (!avatarUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(avatarUrl);
  }, [avatarUrl]);

  useEffect(() => {
    if (!profile || username === profile.username) {
      setAvailability("idle");
      return;
    }
    if (!isValidUsername(username)) {
      setAvailability("invalid");
      return;
    }

    let active = true;
    setAvailability("checking");
    const timeoutId = window.setTimeout(() => {
      void checkUsernameAvailable(username, user?.id)
        .then((available) => {
          if (active) setAvailability(available ? "available" : "taken");
        })
        .catch((error: unknown) => {
          console.warn("Could not check username availability.", error);
          if (active) setAvailability("error");
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [profile, username, user?.id]);

  const pickAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const rawFile = event.target.files?.[0];
    event.target.value = "";
    if (!rawFile) return;

    try {
      const result = await compressImageWithStats(rawFile, COMPRESSION_PRESETS.avatars);
      setAvatarFile(result.file);
      setAvatarUrl(URL.createObjectURL(result.file));
      toast(`Photo compressed to ${formatBytes(result.compressedBytes)}.`, "info");
    } catch (error) {
      toast(describeError(error, "Upload failed. Please check your file size and format."), "danger");
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    if (!isValidUsername(username)) {
      toast("Usernames must be between 3 and 24 characters. Any characters are allowed.", "danger");
      return;
    }

    setSaving(true);
    try {
      if (username !== profile.username && !(await checkUsernameAvailable(username, user?.id))) {
        toast("That nickname is already taken.", "danger");
        setAvailability("taken");
        return;
      }
      const nextAvatarUrl = avatarFile ? await uploadMyAvatar(avatarFile) : undefined;
      const updated = await updateMyProfile({
        username,
        bio,
        website,
        fullName,
        classForm,
        ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {}),
      });
      setProfile(updated);
      setAvatarUrl(updated.avatarUrl);
      posthog.capture("profile_updated", {
        username_changed: username !== profile.username,
        avatar_updated: Boolean(avatarFile),
        bio_updated: bio !== profile.bio,
        website_updated: website !== (profile.website ?? ""),
        full_name_updated: fullName !== (profile.fullName ?? ""),
        class_form_updated: classForm !== (profile.classForm ?? ""),
      });
      toast("Profile updated!", "success");
      navigate("/profile", { replace: true });
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setSaving(false);
    }
  };

  if (loading || (user && !profile)) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <div className="h-96 animate-pulse rounded-3xl border-2 border-line bg-card motion-reduce:animate-none" />
      </main>
    );
  }

  if (!user || !profile) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <Card>
          <CardBody className="p-6 text-center">
            <p className="text-sm font-extrabold text-ink">Log in to edit your profile.</p>
            <Button className="mt-4" onClick={() => navigate("/auth?mode=signin&returnTo=%2Fprofile%2Fedit")}>
              Log In
            </Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
      <button
        type="button"
        onClick={() => navigate("/profile", { replace: true })}
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-extrabold text-ink-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
      >
        <ArrowLeft size={17} strokeWidth={2.6} aria-hidden />
        Back to profile
      </button>

      <Card>
        <CardBody className="p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <Avatar name={username || profile.username} src={avatarUrl} size="2xl" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                aria-label="Upload new avatar"
                className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-2 border-card bg-brand-deep text-brand-contrast shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              >
                <Camera size={16} strokeWidth={2.6} aria-hidden />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={pickAvatar}
                className="sr-only"
                aria-label="Choose profile photo"
              />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-ink sm:text-2xl">Edit your profile</h1>
              <p className="mt-1 text-xs font-semibold text-ink-muted">Update what other students see.</p>
            </div>
          </div>

          <form onSubmit={save} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Nickname</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={24}
                className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-extrabold text-ink outline-none focus:border-brand"
              />
              {availability !== "idle" && (
                <span
                  role="status"
                  className={cn(
                    "mt-1 block text-[11px] font-bold",
                    availability === "available" && "text-success",
                    (availability === "checking" || availability === "error" || availability === "invalid") && "text-ink-muted",
                    availability === "taken" && "text-danger"
                  )}
                >
                  {availability === "checking" && "Checking nickname…"}
                  {availability === "available" && "Nickname is available."}
                  {availability === "taken" && "That nickname is already taken."}
                  {availability === "invalid" && "Use 3–24 characters. Any characters are allowed."}
                  {availability === "error" && "Could not check nickname availability."}
                </span>
              )}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Full official name (optional)</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value.slice(0, 80))}
                  maxLength={80}
                  placeholder="e.g. Kwame Mensah"
                  className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
                />
                <span className="mt-1 block text-[10px] font-semibold text-ink-muted">Used for shoutouts.</span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Class / Form (optional)</span>
                <input
                  value={classForm}
                  onChange={(event) => setClassForm(event.target.value.slice(0, 48))}
                  maxLength={48}
                  placeholder="e.g. Form 2 Science 1"
                  className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-bold text-ink outline-none focus:border-brand"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Campus bio</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value.slice(0, 160))}
                maxLength={160}
                rows={3}
                className="w-full resize-none rounded-xl border-2 border-line bg-page p-3 text-sm font-semibold text-ink outline-none focus:border-brand"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Website (optional)</span>
              <input
                type="text"
                inputMode="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value.slice(0, 200))}
                maxLength={200}
                placeholder="https://example.com"
                className="h-11 w-full rounded-xl border-2 border-line bg-page px-3 text-sm font-semibold text-ink outline-none focus:border-brand"
              />
            </label>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" size="md" loading={saving} leftIcon={<Check size={15} strokeWidth={3} aria-hidden />}>
                Save profile
              </Button>
              <Button type="button" size="md" variant="outline" onClick={() => navigate("/profile", { replace: true })}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
