const EDIT_QUERY = "studioEdit";

const isEditEnabled = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get(EDIT_QUERY) === "1";
};

export const setupVisualEdit = () => {
  let enabled = isEditEnabled();
  let lastTarget: HTMLElement | null = null;

  const highlight = (element: HTMLElement | null) => {
    if (lastTarget) lastTarget.classList.remove("studio-highlight");
    if (element) element.classList.add("studio-highlight");
    lastTarget = element;
  };

  const findStudioElement = (target: HTMLElement | null) => {
    let current: HTMLElement | null = target;
    while (current) {
      if (current.dataset.studioId) return current;
      current = current.parentElement;
    }
    return null;
  };

  window.addEventListener("mouseover", (event) => {
    if (!enabled) return;
    const target = event.target as HTMLElement | null;
    highlight(findStudioElement(target));
  });

  window.addEventListener("click", (event) => {
    if (!enabled) return;
    const target = findStudioElement(event.target as HTMLElement | null);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const payload = {
      studioId: target.dataset.studioId,
      url: window.location.href,
      textPreview: target.textContent?.slice(0, 120),
      tagName: target.tagName,
      timestamp: Date.now(),
    };
    window.parent?.postMessage({ type: "STUDIO_SELECT", payload }, "*");
  }, true);

  window.addEventListener("message", (event) => {
    if (event.data?.type === "STUDIO_TOGGLE_EDIT_MODE") {
      enabled = !enabled;
      if (!enabled) {
        highlight(null);
      }
    }
  });
};
