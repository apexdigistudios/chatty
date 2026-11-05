'use client';

import type { ImgHTMLAttributes } from "react";
import { SafeImage } from "@/components/common/SafeImage";

type BrandLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;

export function BrandLogo({ className, ...props }: BrandLogoProps) {
  return (
    <SafeImage
      src="/logo.png"
      alt="Gist me Logo"
      className={className ?? "h-8 w-auto"}
      {...props}
    />
  );
}
