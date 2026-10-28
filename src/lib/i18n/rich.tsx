import { Fragment } from "react";

/** Fills "{name}" placeholders in a translated string with elements, e.g. highlighted numbers. */
export function rich(template: string, values: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return <Fragment key={i}>{m && m[1] in values ? values[m[1]] : part}</Fragment>;
  });
}
