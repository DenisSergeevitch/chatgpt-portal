import type { Page } from "playwright";
import type { RawPageSnapshot } from "./types.js";

export async function captureRawSnapshot(page: Page): Promise<RawPageSnapshot> {
  const raw = await page.evaluate(`
  (() => {
    const linkSelector = "a[href]";
    const buttonSelector = 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="tab"], summary, a[role="button"]';
    const controlSelector = 'input:not([type="hidden"]):not([type="password"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select';

    const isVisible = (element) => {
      const htmlElement = element;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const textOf = (element) => {
      const htmlElement = element;
      if (htmlElement instanceof HTMLInputElement) {
        return htmlElement.value || htmlElement.getAttribute("aria-label") || htmlElement.name || "";
      }
      return (
        htmlElement.innerText ||
        htmlElement.textContent ||
        htmlElement.getAttribute("aria-label") ||
        htmlElement.getAttribute("title") ||
        ""
      );
    };

    const labelsFor = (element) => {
      const labels = element.labels ? Array.from(element.labels) : [];
      const id = element.id;
      if (id) {
        const explicitLabel = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (explicitLabel && !labels.includes(explicitLabel)) {
          labels.push(explicitLabel);
        }
      }
      const wrappingLabel = element.closest ? element.closest("label") : null;
      if (wrappingLabel && !labels.includes(wrappingLabel)) {
        labels.push(wrappingLabel);
      }
      return labels;
    };

    const labelTextOf = (element) => {
      const labels = labelsFor(element)
        .filter(isVisible)
        .map((label) => label.innerText || label.textContent || "")
        .map((text) => text.replace(/\\s+/g, " ").trim())
        .filter(Boolean);

      return (
        labels[0] ||
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("name") ||
        element.getAttribute("id") ||
        ""
      );
    };

    const controlKindOf = (element) => {
      const tag = element.tagName.toLowerCase();
      if (tag === "textarea") {
        return "textarea";
      }
      if (tag === "select") {
        return "select";
      }
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "radio") {
        return "radio";
      }
      if (type === "checkbox") {
        return "checkbox";
      }
      if (type === "file") {
        return "file";
      }
      return "text";
    };

    const isControlVisible = (element) => {
      const kind = controlKindOf(element);
      if (isVisible(element)) {
        return true;
      }
      if (kind !== "radio" && kind !== "checkbox" && kind !== "file") {
        return false;
      }
      return labelsFor(element).some(isVisible);
    };

    const controlValueOf = (element, kind) => {
      if (kind === "text" || kind === "textarea") {
        return element.value || "";
      }
      if (kind === "select") {
        return element.value || "";
      }
      if (kind === "file") {
        return element.files && element.files.length ? String(element.files.length) : "";
      }
      return element.getAttribute("value") || "";
    };

    const absoluteHref = (value) => {
      if (!value) {
        return "";
      }
      try {
        return new URL(value, document.baseURI).toString();
      } catch (error) {
        return "";
      }
    };

    const links = Array.from(document.querySelectorAll(linkSelector))
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => isVisible(element))
      .map(({ element, index }) => ({
        text: textOf(element),
        href: absoluteHref(element.getAttribute("href")),
        selector: linkSelector,
        index,
      }))
      .filter((link) => link.href);

    const buttons = Array.from(document.querySelectorAll(buttonSelector))
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => isVisible(element))
      .map(({ element, index }) => ({
        text: textOf(element),
        href: absoluteHref(element.getAttribute("href")),
        selector: buttonSelector,
        index,
        role: element.getAttribute("role") || "",
      }));

    const controls = Array.from(document.querySelectorAll(controlSelector))
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => isControlVisible(element))
      .map(({ element, index }) => {
        const kind = controlKindOf(element);
        const options =
          kind === "select"
            ? Array.from(element.options || []).map((option) => ({
                text: option.innerText || option.textContent || option.value || "",
                value: option.value || "",
                selected: Boolean(option.selected),
                disabled: Boolean(option.disabled),
              }))
            : undefined;

        return {
          kind,
          label: labelTextOf(element),
          name: element.getAttribute("name") || "",
          value: controlValueOf(element, kind),
          selector: controlSelector,
          index,
          checked: "checked" in element ? Boolean(element.checked) : undefined,
          disabled: Boolean(element.disabled),
          required: Boolean(element.required),
          accept: element.getAttribute("accept") || "",
          multiple: Boolean(element.multiple),
          inputType: element.getAttribute("type") || "",
          options,
        };
      });

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(isVisible)
      .map(textOf)
      .filter(Boolean);

    const forms = Array.from(document.querySelectorAll("form"))
      .filter(isVisible)
      .map((form) => {
        const fields = Array.from(form.querySelectorAll("input, textarea, select"))
          .filter((field) => {
            const input = field;
            const type = (input.getAttribute("type") || "").toLowerCase();
            return type !== "hidden" && type !== "password" && isVisible(field);
          })
          .map((field) => {
            const input = field;
            const id = input.id;
            const label = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]')?.textContent || "" : "";
            return (
              label ||
              input.getAttribute("aria-label") ||
              input.getAttribute("placeholder") ||
              input.getAttribute("name") ||
              input.tagName.toLowerCase()
            );
          })
          .filter(Boolean);

        return { fields };
      });

    return {
      url: window.location.href,
      title: document.title,
      visibleText: document.body?.innerText || "",
      headings,
      links,
      buttons,
      controls,
      forms,
    };
  })()
  `) as RawPageSnapshot;

  return raw;
}
