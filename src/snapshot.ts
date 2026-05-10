import type { Page } from "playwright";
import type { RawPageSnapshot } from "./types.js";

export async function captureRawSnapshot(page: Page): Promise<RawPageSnapshot> {
  const raw = await page.evaluate(`
  (() => {
    const linkSelector = "a[href]";
    const buttonSelector = 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="tab"], summary, a[role="button"]';

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
      forms,
    };
  })()
  `) as RawPageSnapshot;

  return raw;
}
