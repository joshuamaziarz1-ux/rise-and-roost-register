// Parses the saved copy bundle in the browser only. Never puts keys in URLs or storage.
export function parseAccessDetails(text) {
  const id = /^\s*Workspace ID:\s*([a-f0-9]{48})\s*$/im.exec(text)?.[1].toLowerCase();
  const accessKey = /^\s*Private access key:\s*([a-f0-9]{48})\s*$/im.exec(text)?.[1];
  if (!id || !accessKey) throw new Error("Paste the complete saved Workspace ID and Private access key together. Do not paste them into chat.");
  return { id, accessKey };
}
export const normalizeDeviceCode = (value) => typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";
