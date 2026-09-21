// Three sessions of somebody using wizmap. The artifact is untouched; the
// only thing between it and the browser is the generic preview gateway.
//
// These are driver sessions, not human recordings — a real limitation,
// recorded as such. They were written as plausible things to do with an
// embedding map of paper abstracts, mixing the gestures (drag, wheel)
// with the controls (search, view modes, zoom buttons, time, labels),
// the way somebody actually works. They were NOT written to produce one
// action per behaviour class, and no behaviour vocabulary was consulted.
// Pauses are real waits, so silence in the trace is real silence.
export const SESSIONS = {
  // DISCOVERY — first contact. What is this, and what can it do?
  discovery: async (p, { pause, drag, wheel, click }) => {
    await pause(4000);
    await p.mouse.move(700, 430); await pause(1500);
    await drag(700, 430, 470, 330);
    await pause(2500);
    await wheel(600, 400, -400);
    await pause(3000);
    await click("plus"); await pause(3000);
    await click("plus"); await pause(4000);
    await p.mouse.move(640, 430); await pause(2000);
    await click("Point"); await pause(6000);
    await click("Grid"); await pause(5000);
    await click("Contour"); await pause(4000);
    await click("minus"); await pause(2500);
    await click("home"); await pause(4000);
    await drag(720, 450, 660, 520);
    await pause(3000);
    await click("plus"); await pause(3500);
    await click("plus"); await pause(9000);
    await click("home"); await pause(6000);
  },

  // HELD-OUT 1 — came with a question. Search-led.
  search: async (p, { pause, drag, wheel, click, type }) => {
    await pause(3500);
    await type("#search-bar-input", "translation");
    await pause(6000);
    await click("plus"); await pause(3000);
    await drag(900, 300, 700, 430);
    await pause(3500);
    await p.fill("#search-bar-input", "");
    await pause(2000);
    await type("#search-bar-input", "sentiment analysis");
    await pause(7000);
    await click("plus"); await pause(3000);
    await wheel(760, 520, -300);
    await pause(4000);
    await type("#search-bar-input", " of reviews");
    await pause(5000);
    await p.fill("#search-bar-input", "");
    await pause(2500);
    await click("home"); await pause(3000);
    await click("Point"); await pause(5000);
    await click("Contour"); await pause(7000);
  },

  // HELD-OUT 2 — fiddling with the controls, and a long gap in the middle.
  controls: async (p, { pause, drag, wheel, click }) => {
    await pause(3500);
    await click("Time"); await pause(2500);
    await drag(620, 78, 780, 78);
    await pause(4500);
    await drag(780, 78, 700, 78);
    await pause(3500);
    await click("Label"); await pause(2500);
    await p.locator("#slider-label-num").click({ force: true, position: { x: 30, y: 9 } });
    await pause(3500);
    await p.locator("#checkbox-label").click({ force: true });
    await pause(5000);
    await pause(48000);                                    // walked away
    await click("Grid"); await pause(5500);
    await wheel(720, 450, -350);
    await pause(3000);
    await click("plus"); await pause(3000);
    await click("minus"); await pause(2500);
    await click("minus"); await pause(3500);
    await drag(720, 450, 840, 390);
    await pause(3000);
    await click("Contour"); await pause(4000);
    await click("home"); await pause(7000);
  },
};
