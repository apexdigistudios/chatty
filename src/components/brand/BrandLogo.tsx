import type { ImgHTMLAttributes } from "react";

type BrandLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;

export function BrandLogo({ className, ...props }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Gist me Logo"
      className={className ?? "h-8 w-auto"}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = "/favicon.svg";
      }}
      {...props}
    />
  );
}
