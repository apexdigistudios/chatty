'use client';

import { useParams } from "@/lib/router";
import { ConfessionShareCardPage } from "@/views/ConfessionShareCardPage";

export default function ConfessionCardRoute() {
  const { id } = useParams<{ id: string }>();
  return <ConfessionShareCardPage id={id} />;
}
