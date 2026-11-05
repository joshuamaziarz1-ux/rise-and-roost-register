// Existing products keep their original accounting until an owner chooses a
// selling method. In particular, legacy preorders retain both stock and limits.
export const sellingMethods = Object.freeze(['online', 'preorder', 'in-store']);

export function sellingMethod(product) {
  if (sellingMethods.includes(product?.sellingMethod)) return product.sellingMethod;
  if (product?.channel === 'store') return 'in-store';
  return product?.inventoryMode === 'physical' ? 'online' : 'preorder';
}

export function inventoryMode(product) {
  if (product?.sellingMethod === 'preorder') return 'production';
  if (['online', 'in-store'].includes(product?.sellingMethod)) return 'physical';
  if (product?.channel === 'store') return 'physical';
  return product?.inventoryMode || 'legacy';
}

export function normalizeSellingMethod(product) {
  const next = { ...product };
  if (sellingMethods.includes(next.sellingMethod)) {
    next.channel = next.sellingMethod === 'in-store' ? 'store' : 'preorder';
    next.inventoryMode = inventoryMode(next);
  }
  return next;
}
