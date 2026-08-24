export function claimAutomaticSettlementCreation(
  claims: Set<string>,
  obligationId: string,
  tokenId: string,
): boolean {
  const key = `${obligationId}:${tokenId}`;
  if (claims.has(key)) return false;
  claims.add(key);
  return true;
}

export function isCurrentSettlementOperation(
  currentObligationId: string,
  currentGeneration: number,
  operationObligationId: string,
  operationGeneration: number,
): boolean {
  return currentObligationId === operationObligationId &&
    currentGeneration === operationGeneration;
}
