import { ListField } from "@shared/ui/fields";
import type { Step } from "../model/types";
import { editStepTexts, texts } from "../model/steps";

/** The list field for Given steps (preconditions, Background): the user edits
 *  texts and every step keeps its stable id (DAT-02): by row while typing,
 *  aligned on an insert or a delete (`editStepTexts`). */
export function StepListField({
  items,
  onChange,
  label,
  placeholder,
}: {
  items: Step[];
  onChange: (next: Step[]) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <ListField
      label={label}
      placeholder={placeholder}
      items={texts(items)}
      onChange={(next) => onChange(editStepTexts(items, next))}
    />
  );
}
