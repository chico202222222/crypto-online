import React from "react";
import Link from "next/link";

interface MercuryLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showIcon?: boolean;
  href?: string;
  className?: string;
}

const sizeClasses = {
  sm: {
    icon: "h-6 w-6 pb-1",
    bar1: "h-1.5 w-[2px]",
    bar2: "h-3 w-[2px]",
    bar3: "h-2 w-[2px]",
    text: "text-sm",
  },
  md: {
    icon: "h-8 w-8 pb-[7px]",
    bar1: "h-2 w-[3px]",
    bar2: "h-4 w-[3px]",
    bar3: "h-3 w-[3px]",
    text: "text-[16px]",
  },
  lg: {
    icon: "h-10 w-10 pb-2",
    bar1: "h-2.5 w-[3.5px]",
    bar2: "h-5 w-[3.5px]",
    bar3: "h-3.5 w-[3.5px]",
    text: "text-xl",
  },
  xl: {
    icon: "h-12 w-12 pb-2.5",
    bar1: "h-3 w-1",
    bar2: "h-6 w-1",
    bar3: "h-4 w-1",
    text: "text-2xl sm:text-3xl",
  },
};

export function MercuryWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-bold tracking-tight select-none ${className}`}>
      <span className="text-[#c6a779] transition-colors duration-200">Mer</span>
      <span className="text-white transition-colors duration-200">cury</span>
    </span>
  );
}

export function MercuryLogo({
  size = "md",
  showIcon = true,
  href,
  className = "",
}: MercuryLogoProps) {
  const cfg = sizeClasses[size] || sizeClasses.md;

  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {showIcon && (
        <span
          className={`flex shrink-0 items-end justify-center gap-[3px] rounded-lg border border-[#685a45] bg-[#251f1a] shadow-inner transition-transform duration-200 group-hover:scale-105 ${cfg.icon}`}
          aria-hidden="true"
        >
          <span className={`rounded-[1px] bg-[#c6a779] ${cfg.bar1}`} />
          <span className={`rounded-[1px] bg-[#c6a779] ${cfg.bar2}`} />
          <span className={`rounded-[1px] bg-[#c6a779] ${cfg.bar3}`} />
        </span>
      )}
      <MercuryWordmark className={cfg.text} />
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="group inline-flex items-center focus:outline-none" aria-label="Mercury, ir à página inicial">
        {content}
      </Link>
    );
  }

  return content;
}
