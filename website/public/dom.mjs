export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "style") {
      for (const [property, entry] of Object.entries(value)) {
        if (property.startsWith("--")) node.style.setProperty(property, entry);
        else node.style[property] = entry;
      }
    } else if (key === "class") node.className = value;
    else if (key === "value" || key === "checked" || key === "disabled")
      node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity))
    if (child !== undefined && child !== null && child !== false)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export const button = (label, action, attrs = {}) =>
  h("button", { type: "button", onclick: action, ...attrs }, label);
export function notify(message, error = false) {
  const box = document.querySelector("#notice");
  box.textContent = message;
  box.className = error ? "error visible" : "visible";
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (box.className = ""), error ? 12000 : 5000);
}
export async function request(path, data) {
  const response = await fetch(
    path,
    data === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The website is temporarily unavailable. Please try again. Your unsaved edits are still in this tab.");
  }
  if (!response.ok)
    throw Object.assign(new Error(result.error || "Please try again."), {
      status: response.status,
    });
  return result;
}
export const guard =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      notify(error.message, true);
    }
  };
export function field(label, value, change, options = {}) {
  const { type = "text", choices, ...rest } = options;
  const input = choices
    ? h(
        "select",
        { ...rest, onchange: (e) => change(e.target.value) },
        choices.map((choice) =>
          h(
            "option",
            {
              value: choice.value ?? choice,
              selected: (choice.value ?? choice) === value,
            },
            choice.label ?? choice,
          ),
        ),
      )
    : h(type === "textarea" ? "textarea" : "input", {
        type: type === "textarea" ? undefined : type,
        value,
        ...rest,
        oninput: (e) =>
          change(type === "checkbox" ? e.target.checked : e.target.value),
      });
  if (type === "checkbox") input.checked = value;
  input.setAttribute("aria-label", label);
  return h("label", { class: "field" }, h("span", {}, label), input);
}
