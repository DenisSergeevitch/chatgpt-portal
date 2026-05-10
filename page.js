document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-copy], button[data-copy-target]");
  if (!button) {
    return;
  }

  const targetId = button.getAttribute("data-copy-target");
  const target = targetId ? document.getElementById(targetId) : null;
  const value = target && "value" in target ? target.value : button.getAttribute("data-copy") || "";
  const original = button.textContent;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    button.textContent = "Copied";
  } catch (error) {
    button.textContent = "Copy failed";
  }

  window.setTimeout(() => {
    button.textContent = original;
  }, 1400);
});
