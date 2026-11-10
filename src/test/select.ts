import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type User = Pick<ReturnType<typeof userEvent.setup>, "click">;

/** Picks the option with `value` in a Pharos `Select` (UX-30), the way a
 *  person does: opens it and clicks the option. Replaces
 *  `userEvent.selectOptions`, which only knows native `<select>`s. */
export async function selectValue(combo: HTMLElement, value: string, user: User = userEvent) {
  if (combo.getAttribute("aria-expanded") !== "true") await user.click(combo);
  const list = document.getElementById(combo.getAttribute("aria-controls") ?? "");
  const option = list?.querySelector<HTMLElement>(`[role="option"][data-value="${CSS.escape(value)}"]`);
  if (!option) throw new Error(`no option with value «${value}» in ${combo.id || "the select"}`);
  await user.click(option);
  await act(async () => {});
}

/** The labels of a Pharos `Select`'s options, in order (opens and closes it). */
export async function optionLabels(combo: HTMLElement): Promise<string[]> {
  await userEvent.click(combo);
  const list = document.getElementById(combo.getAttribute("aria-controls") ?? "");
  const labels = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? []).map(
    (o) => o.querySelector(".menu__title")?.textContent ?? o.textContent ?? "",
  );
  await userEvent.keyboard("{Escape}");
  return labels;
}
