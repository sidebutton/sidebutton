import type { Action } from "../types";

type Step = Action["steps"][number];

/**
 * Formats step details for display in the UI.
 * Returns a human-readable summary of the step's main parameter.
 */
export function formatStepDetails(step: Step): string {
  switch (step.type) {
    case "browser.navigate":
      return (step as { url?: string }).url || "";
    case "browser.click":
    case "browser.type":
    case "browser.wait":
    case "browser.extract":
    case "browser.hover":
      return (step as { selector?: string }).selector || "";
    case "shell.run":
      return (step as { cmd?: string }).cmd || "";
    case "workflow.call":
      return (step as { workflow?: string }).workflow || "";
    case "llm.generate": {
      const prompt = (step as { prompt?: string }).prompt || "";
      return prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt;
    }
    case "control.if":
      return (step as { condition?: string }).condition || "";
    case "control.retry":
      return `max ${(step as { max_attempts?: number }).max_attempts || 3} attempts`;
    case "control.stop":
      return (step as { message?: string }).message || "";
    default:
      return "";
  }
}

/**
 * Returns the list of editable fields for a given step type.
 * Used by the step editing form.
 */
export function getStepEditableFields(stepType: string): string[] {
  const commonFields = ["type"];
  switch (stepType) {
    case "browser.navigate":
      return [...commonFields, "url"];
    case "browser.click":
      return [...commonFields, "selector", "timeout"];
    case "browser.type":
      return [...commonFields, "selector", "text", "timeout"];
    case "browser.wait":
      return [...commonFields, "selector", "timeout"];
    case "browser.extract":
      return [...commonFields, "selector", "attribute", "as"];
    case "browser.extractAll":
      return [...commonFields, "selector", "attribute", "as"];
    case "browser.hover":
      return [...commonFields, "selector"];
    case "browser.scroll":
      return [...commonFields, "selector", "direction", "amount"];
    case "browser.exists":
      return [...commonFields, "selector", "as"];
    case "browser.key":
      return [...commonFields, "key"];
    case "shell.run":
      return [...commonFields, "cmd", "cwd"];
    case "terminal.open":
      return [...commonFields, "cwd"];
    case "terminal.run":
      return [...commonFields, "cmd"];
    case "workflow.call":
      return [...commonFields, "workflow", "params"];
    case "llm.generate":
      return [...commonFields, "prompt", "as"];
    case "llm.classify":
      return [...commonFields, "prompt", "options", "as"];
    case "control.if":
      return [...commonFields, "condition", "then", "else"];
    case "control.retry":
      return [...commonFields, "max_attempts", "steps"];
    case "control.stop":
      return [...commonFields, "message"];
    case "data.first":
      return [...commonFields, "from", "as"];
    default:
      return commonFields;
  }
}
