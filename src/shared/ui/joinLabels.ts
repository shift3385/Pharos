/** "a, b y c" for a save bar or a notice; `and` is the translated conjunction. */
export function joinLabels(labels: string[], and: string): string {
  if (labels.length < 2) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} ${and} ${labels[labels.length - 1]}`;
}
