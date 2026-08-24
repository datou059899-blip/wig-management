type SnapshotQuantitySource = 'totalQty' | 'availableLocked' | 'none'

export function buildEffectiveInventorySnapshotWhere<T extends Record<string, unknown>>(where?: T) {
  const effectiveSnapshotWhere = {
    OR: [
      { importBatchId: null },
      { importBatch: { status: 'CONFIRMED' } },
    ],
  }

  if (!where || Object.keys(where).length === 0) {
    return effectiveSnapshotWhere
  }

  return {
    AND: [
      where,
      effectiveSnapshotWhere,
    ],
  }
}

export function resolveInventorySnapshotQuantity(snapshot: {
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
}): { quantity: number | null; source: SnapshotQuantitySource } {
  if (snapshot.totalQty !== null && snapshot.totalQty !== undefined && snapshot.totalQty >= 0) {
    return { quantity: snapshot.totalQty, source: 'totalQty' }
  }

  if (snapshot.availableQty !== null || snapshot.lockedQty !== null) {
    return {
      quantity: Math.max((snapshot.availableQty ?? 0) + (snapshot.lockedQty ?? 0), 0),
      source: 'availableLocked',
    }
  }

  return { quantity: null, source: 'none' }
}
