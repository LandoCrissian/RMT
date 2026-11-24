"use client";

import { useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { optionalHttpsUrl, optionalXProfile } from "@/lib/submission-validation";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  value: string;
  missingHome?: boolean;
  profile?: boolean;
};

export default function ProjectLinkInput({ label, value, profile, missingHome, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [touched, setTouched] = useState(false);
  let error = "";
  try {
    if (missingHome) error = "Add a website here or enter your project’s official X profile.";
    else if (props.required && !value.trim()) error = "Enter the " + label.toLowerCase() + ".";
    else if (profile) optionalXProfile(value);
    else optionalHttpsUrl(value, label);
  } catch (cause) {
    error = profile ? "Enter the project profile, such as x.com/yourproject." : cause instanceof Error ? cause.message : "Check this link.";
  }
  useLayoutEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  const showError = touched && Boolean(error);
  return <>
    <input {...props} ref={input} type="text" inputMode="url" autoCapitalize="none" spellCheck={false}
      value={value} onBlur={() => setTouched(true)} onInvalid={() => setTouched(true)}
      aria-invalid={showError || undefined} aria-describedby={showError ? errorId : undefined} />
    {showError && <span id={errorId} className="st-error" role="alert">{error}</span>}
  </>;
}
