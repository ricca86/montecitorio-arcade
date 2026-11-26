export const DEFAULT_WIN_QUOTES = {
  meloni: "HAI SFIDATO IL PREMIER. LA TUA GUARDIA ERA DEBOLE.",
  salvini: "TANTE CHIACCHIERE, ZERO COMBO. TORNA IN PANCHINA!",
  tajani: "IL PROTOCOLLO IMPONE LA TUA SCONFITTA. AVANTI IL PROSSIMO.",
  renzi: "TROPPO LENTO! IL MIO GIOCO DI GAMBE È GIÀ NELLA PROSSIMA LEGISLATURA!",
  calenda: "ALLA TUA STRATEGIA MANCANO I DATI. LEGGI IL DOSSIER E RIPROVA.",
  schlein: "NON HANNO VISTO ARRIVARE IL MONTANTE. E NEMMENO TU.",
  conte: "CON DECRETO DI MEZZANOTTE, QUESTO INCONTRO È UFFICIALMENTE CHIUSO.",
  bonelli: "K.O. RINNOVABILE AL 100%. ZERO EMISSIONI, MASSIMO DANNO."
};

function pairKey(idA, idB) {
  return [idA, idB].sort().join("::");
}

export const RIVAL_WIN_QUOTES = {
  [pairKey("renzi", "calenda")]: "IL TERZO POLO ERA TROPPO STRETTO PER DUE COMBO COSÌ.",
  [pairKey("meloni", "schlein")]: "ALTRO CHE CONFRONTO TV: HA DECISO IL RING!",
  [pairKey("salvini", "conte")]: "FINE DELLA COALIZIONE. INIZIA IL ROUND FINALE!",
  [pairKey("tajani", "meloni")]: "VERTICE DI MAGGIORANZA CHIUSO AI PUNTI VITA."
};

function extractFighterId(fighter) {
  if (!fighter) return "";
  return typeof fighter === "string" ? fighter : (fighter.id || "");
}

/**
 * Resolve the arcade victory quote for a finished match, preferring rival pair lines
 * when both fighters are a defined rival matchup.
 */
export function getWinQuote(winner, loser) {
  const winnerId = extractFighterId(winner);
  const loserId = extractFighterId(loser);
  if (winnerId && loserId && winnerId !== loserId) {
    const rivalQuote = RIVAL_WIN_QUOTES[pairKey(winnerId, loserId)];
    if (rivalQuote) return rivalQuote;
  }
  return DEFAULT_WIN_QUOTES[winnerId] || "";
}

/**
 * Reveal `quote` on `node` using an arcade cabinet typewriter effect and return a cancel callback.
 */
export function startQuoteTypewriter(node, quote, {
  charDelayMs = 26,
  setTimer = setInterval,
  clearTimer = clearInterval,
  onStep = null,
  onComplete = null
} = {}) {
  if (!node) return () => {};
  const text = String(quote || "");
  if (node.dataset) node.dataset.fullQuote = text;

  const reducedMotion = typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)")?.matches;

  if (!text || charDelayMs <= 0 || reducedMotion) {
    node.textContent = text;
    node.classList?.remove("is-typing");
    onComplete?.(text);
    return () => {};
  }

  let index = 0;
  node.textContent = "";
  node.classList?.add("is-typing");
  let timerId = null;

  const cancel = () => {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
    node.classList?.remove("is-typing");
  };

  timerId = setTimer(() => {
    index += 1;
    node.textContent = text.slice(0, index);
    onStep?.(index, node.textContent);
    if (index >= text.length) {
      cancel();
      onComplete?.(text);
    }
  }, charDelayMs);

  return cancel;
}
