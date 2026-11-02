import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Mail, MapPin, PackageCheck, Send, Stamp, Truck } from "lucide-react";
import { timeAgo } from "../../lib/time";
import { springs } from "../../theme/tokens";
import type { Shoutout } from "../../types/models";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardBody } from "../ui/Card";
import { PostalEnvelope } from "./PostalEnvelope";
import { cn } from "../../utils/cn";
import type { School } from "../../types/models";

interface ShoutoutCardProps {
  shoutout: Shoutout;
  mode: "inbox" | "outbox";
  school: School | null;
  senderSchoolName?: string;
  onOpen?: (shoutout: Shoutout) => void;
  onReply?: (shoutout: Shoutout) => void;
}

const STAGE_COPY: Record<Shoutout["status"], string> = {
  in_transit: "In transit",
  arrived: "Arrived at mail room",
  delivered: "Delivered",
};

export function deliveryCopy(shoutout: Shoutout, recipientSchoolShort: string, senderSchoolShort?: string): string {
  if (shoutout.status === "delivered") return `Delivered to ${shoutout.recipientName}`;
  if (shoutout.status === "arrived") return `Arrived at ${recipientSchoolShort} Mail Room`;
  return `In Transit from ${senderSchoolShort ?? "your SHS"} Post Office`;
}

/** Sealed digital letter for inbox; delivery tracker for outbox. */
export function ShoutoutCard({ shoutout, mode, school, senderSchoolName, onOpen, onReply }: ShoutoutCardProps) {
  const [opened, setOpened] = useState(mode === "outbox" || Boolean(shoutout.openedAt));
  const [opening, setOpening] = useState(false);

  const openSeal = () => {
    if (opened || opening) return;
    setOpening(true);
    window.setTimeout(() => {
      setOpened(true);
      setOpening(false);
      onOpen?.(shoutout);
    }, 480);
  };

  const recipientShort = school?.shortName ?? "SHS";

  return (
    <Card className="relative overflow-hidden">
      <CardBody className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={mode === "inbox" ? "brand" : shoutout.status === "delivered" ? "success" : "warning"} className="px-2 py-0.5 text-[9px]">
              {mode === "inbox" ? <Mail size={10} strokeWidth={2.6} aria-hidden /> : <Truck size={10} strokeWidth={2.6} aria-hidden />}
              {mode === "inbox" ? "Received" : STAGE_COPY[shoutout.status]}
            </Badge>
            <span className="text-[10px] font-bold text-ink-muted">{timeAgo(shoutout.createdAt)}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-brand-deep">
            <Stamp size={11} strokeWidth={2.6} aria-hidden />
            {shoutout.stamp.replace(/_/g, " ")}
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center">
          <div className="relative">
            <PostalEnvelope
              school={school}
              theme={shoutout.envelopeTheme}
              stampLabel={shoutout.stamp.replace(/_/g, " ")}
              recipientName={shoutout.recipientName}
              recipientClass={shoutout.recipientClass || "SHS student"}
              senderName={shoutout.senderName}
              sealed={mode === "inbox" && !opened}
              compact
            />
            {mode === "inbox" && !opened && (
              <motion.button
                type="button"
                onClick={openSeal}
                whileTap={{ scale: 0.9 }}
                animate={opening ? { scale: [1, 1.25, 0], rotate: [0, 15, 45], opacity: [1, 1, 0] } : { scale: 1, rotate: 0, opacity: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/10 text-[10px] font-black uppercase tracking-wider text-white"
                aria-label="Open wax-sealed shoutout"
              >
                <span className="rounded-full bg-[#18181B]/80 px-3 py-1.5 backdrop-blur">Tap to break the seal</span>
              </motion.button>
            )}
          </div>

          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              {opened ? (
                <motion.div
                  key="letter"
                  initial={{ opacity: 0, y: 12, rotateX: -12 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={springs.bouncy}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-deep">
                    From {shoutout.senderName}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-ink-soft">
                    {shoutout.message}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-ink-muted">
                    To {shoutout.recipientName} · {shoutout.recipientClass || "SHS student"} · {recipientShort}
                  </p>
                  {mode === "inbox" && onReply && (
                    <Button size="sm" variant="outline" className="mt-3" leftIcon={<Send size={13} strokeWidth={2.6} aria-hidden />} onClick={() => onReply(shoutout)}>
                      Reply by paper plane
                    </Button>
                  )}
                </motion.div>
              ) : (
                <motion.p key="sealed-copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-semibold leading-relaxed text-ink-muted">
                  A wax-sealed letter from {shoutout.senderName} is waiting for you at {recipientShort} Mail Room.
                </motion.p>
              )}
            </AnimatePresence>

            {mode === "outbox" && (
              <div className="mt-3 rounded-2xl border-2 border-line bg-page p-3">
                <p className="flex items-start gap-1.5 text-xs font-extrabold leading-snug text-ink">
                  {shoutout.status === "delivered" ? <PackageCheck size={15} className="mt-0.5 shrink-0 text-success" aria-hidden /> : <Truck size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />}
                  {deliveryCopy(shoutout, recipientShort, senderSchoolName)}
                </p>
                <div className="mt-2.5 grid grid-cols-3 gap-1">
                  {(["in_transit", "arrived", "delivered"] as const).map((stage, index) => {
                    const reached = (["in_transit", "arrived", "delivered"] as const).indexOf(shoutout.status) >= index;
                    return (
                      <div key={stage} className="flex items-center gap-1">
                        <span className={cn("h-1.5 flex-1 rounded-full", reached ? "bg-[#8B5CF6]" : "bg-line")} />
                        {index === 2 && reached && <CheckCircle2 size={12} className="text-success" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-ink-muted">
                  <MapPin size={11} aria-hidden />
                  {STAGE_COPY[shoutout.status]} · {recipientShort}
                </p>
              </div>
            )}
          </div>
        </div>

        {mode === "outbox" && shoutout.openedAt && (
          <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-success-deep">
            <CheckCircle2 size={12} aria-hidden />
            Opened by recipient {timeAgo(shoutout.openedAt)}
            <ArrowRight size={11} aria-hidden />
          </p>
        )}
      </CardBody>
    </Card>
  );
}
