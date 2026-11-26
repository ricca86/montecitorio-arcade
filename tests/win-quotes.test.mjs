import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WIN_QUOTES, RIVAL_WIN_QUOTES, getWinQuote, startQuoteTypewriter } from "../win-quotes.js";

test("DEFAULT_WIN_QUOTES contains all 8 Italian arcade victory quotes", () => {
  const expected = {
    meloni: "HAI SFIDATO IL PREMIER. LA TUA GUARDIA ERA DEBOLE.",
    salvini: "TANTE CHIACCHIERE, ZERO COMBO. TORNA IN PANCHINA!",
    tajani: "IL PROTOCOLLO IMPONE LA TUA SCONFITTA. AVANTI IL PROSSIMO.",
    renzi: "TROPPO LENTO! IL MIO GIOCO DI GAMBE È GIÀ NELLA PROSSIMA LEGISLATURA!",
    calenda: "ALLA TUA STRATEGIA MANCANO I DATI. LEGGI IL DOSSIER E RIPROVA.",
    schlein: "NON HANNO VISTO ARRIVARE IL MONTANTE. E NEMMENO TU.",
    conte: "CON DECRETO DI MEZZANOTTE, QUESTO INCONTRO È UFFICIALMENTE CHIUSO.",
    bonelli: "K.O. RINNOVABILE AL 100%. ZERO EMISSIONI, MASSIMO DANNO."
  };
  assert.deepEqual(DEFAULT_WIN_QUOTES, expected);
});

test("RIVAL_WIN_QUOTES trigger symmetrically for either winner and ignore mirror matches", () => {
  const pairs = [
    ["renzi", "calenda", "IL TERZO POLO ERA TROPPO STRETTO PER DUE COMBO COSÌ."],
    ["meloni", "schlein", "ALTRO CHE CONFRONTO TV: HA DECISO IL RING!"],
    ["salvini", "conte", "FINE DELLA COALIZIONE. INIZIA IL ROUND FINALE!"],
    ["tajani", "meloni", "VERTICE DI MAGGIORANZA CHIUSO AI PUNTI VITA."]
  ];

  assert.equal(Object.keys(RIVAL_WIN_QUOTES).length, 4);
  for (const [a, b, quote] of pairs) {
    assert.equal(getWinQuote(a, b), quote);
    assert.equal(getWinQuote(b, a), quote);
    assert.equal(getWinQuote({ id: a }, { id: b }), quote);
  }

  // Mirror matches and non-rival pairings fall back to winner's default quote
  assert.equal(getWinQuote("meloni", "meloni"), DEFAULT_WIN_QUOTES.meloni);
  assert.equal(getWinQuote("bonelli", "calenda"), DEFAULT_WIN_QUOTES.bonelli);
});

test("startQuoteTypewriter reveals characters step by step and supports cancellation", () => {
  const classes = new Set();
  const node = {
    textContent: "",
    dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c)
    }
  };
  let tick = null;
  let cleared = 0;
  let completedWith = null;

  const quote = "HA DECISO IL RING!";
  const cancel = startQuoteTypewriter(node, quote, {
    charDelayMs: 25,
    setTimer: (fn) => {
      tick = fn;
      return 99;
    },
    clearTimer: (id) => {
      if (id === 99) cleared += 1;
    },
    onComplete: (full) => {
      completedWith = full;
    }
  });

  assert.equal(node.textContent, "");
  assert.equal(classes.has("is-typing"), true);
  assert.equal(node.dataset.fullQuote, quote);

  tick();
  tick();
  assert.equal(node.textContent, "HA");

  for (let i = 2; i < quote.length; i += 1) tick();
  assert.equal(node.textContent, quote);
  assert.equal(classes.has("is-typing"), false);
  assert.equal(cleared, 1);
  assert.equal(completedWith, quote);

  // Verify early cancellation clears timer and typing state
  let cancelledId = null;
  const abort = startQuoteTypewriter(node, "TEST", {
    charDelayMs: 25,
    setTimer: (fn) => {
      tick = fn;
      return 123;
    },
    clearTimer: (id) => {
      cancelledId = id;
    }
  });
  tick();
  assert.equal(node.textContent, "T");
  abort();
  assert.equal(cancelledId, 123);
  assert.equal(classes.has("is-typing"), false);
});
