import type { Dispatch, SetStateAction } from "react";
import type { AiProvenance } from "@modules/ai";
import type { AssistedField, FormState, ReviewableField } from "./formState";

/** What every step body gets from the wizard. */
export interface StepProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setForm: Dispatch<SetStateAction<FormState | null>>;
  aiReady: boolean;
  aiProps: (field: AssistedField) => {
    provenance: AiProvenance | undefined;
    onUse: (text: string, provenance: AiProvenance) => void;
    onReview: () => void;
  };
  review: (field: ReviewableField) => () => void;
  /** A save was attempted: required fields show their error. */
  attempted: boolean;
  /** Author shown in step 2 (the plan's, else the signed-in user). */
  author: string;
  /** Completed flag of every step (step 19 lists the missing ones). */
  completion: boolean[];
  goTo: (index: number) => void;
}

export function FieldLabel({ text }: { text: string }) {
  return <p className="tp-field__grouplabel">{text}</p>;
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="tp-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  solo,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** The step's only text: its title already names it, so the label stays for
   *  assistive technology only and the field takes the room. */
  solo?: boolean;
}) {
  return (
    <label className="tp-field">
      <span className={solo ? "sr-only" : undefined}>{label}</span>
      <textarea rows={solo ? 12 : 4} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
