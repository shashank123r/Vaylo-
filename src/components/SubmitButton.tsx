"use client";

import { useFormStatus } from "react-dom";

// A submit button that disables itself while its form's action is in flight, so a
// double-click cannot submit the same form twice (e.g. creating duplicate jobs).
// Must be rendered inside a <form>.
export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} aria-busy={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
