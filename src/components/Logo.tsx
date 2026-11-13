import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 no-underline">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brick text-[13px] font-bold text-white">
        V
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Vaylo</span>
    </Link>
  );
}
