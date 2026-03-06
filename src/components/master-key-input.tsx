// Secure Master Key input using useRef to prevent password from leaking into React state.
// Value is read from ref, passed to callback, then immediately cleared.

import { useRef } from "react";
import { Lock } from "lucide-react";

interface MasterKeyInputProps {
  label?: string;
  placeholder?: string;
  onSubmit: (password: string) => void;
  submitText?: string;
  disabled?: boolean;
}

export default function MasterKeyInput({
  label = "Master Key",
  placeholder = "Enter your Master Key",
  onSubmit,
  submitText = "Confirm",
  disabled = false,
}: MasterKeyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputRef.current?.value;
    if (!value) return;

    onSubmit(value);

    // Immediately clear the input to prevent state leak
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-foreground">
        <Lock className="inline w-4 h-4 mr-1.5 -mt-0.5" />
        {label}
      </label>
      <input
        ref={inputRef}
        type="password"
        placeholder={placeholder}
        autoComplete="off"
        data-1p-ignore
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled}
        className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitText}
      </button>
    </form>
  );
}
