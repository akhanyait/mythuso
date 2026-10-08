import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSvg, labelled } from "./svg.ts";

const good = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#189870"/></linearGradient></defs>
  <rect x="0" y="0" width="800" height="600" fill="#eef6f7"/>
  <circle cx="400" cy="250" r="120" fill="url(#g)"/>
  <text x="400" y="520" font-family="sans-serif" font-size="32" text-anchor="middle">Wash for 20 seconds &amp; dry</text>
</svg>`;

test("a well-made drawing survives, inside a fence and a sentence", () => {
  const c = cleanSvg("Here is your drawing:\n```svg\n" + good + "\n```\nEnjoy!");
  assert.ok(c.ok);
  assert.deepEqual(c.viewBox, [0, 0, 800, 600]);
  assert.match(c.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 800 600">/);
  assert.match(c.svg, /fill="url\(#g\)"/);
  assert.match(c.svg, /Wash for 20 seconds &amp; dry/);
  assert.doesNotMatch(c.svg.slice(0, c.svg.indexOf(">")), /width=/, "the root's fixed size is dropped so it scales");
});

test("scripts, handlers, links, images and embedded HTML are removed with what they carry", () => {
  const bad = good.replace(
    "</svg>",
    `<script>alert(1)</script><a href="https://evil.example"><text x="1" y="1">click</text></a>
     <image href="https://evil.example/x.png" width="10" height="10"/>
     <foreignObject><div>html</div></foreignObject>
     <rect x="1" y="1" width="2" height="2" onclick="alert(1)" style="fill:url(https://evil.example)" fill="url(https://evil.example/f)"/>
     <use href="#g"/><animate attributeName="x"/></svg>`,
  );
  const c = cleanSvg(bad);
  assert.ok(c.ok);
  for (const gone of ["script", "alert", "evil", "<a", "image", "foreignObject", "html", "onclick", "style", "<use", "animate", "click"]) assert.ok(!c.svg.includes(gone), gone);
});

test("javascript: and data: values are dropped", () => {
  const c = cleanSvg(good.replace('fill="#eef6f7"', 'fill="javascript:alert(1)"').replace('stop-color="#14b8a6"', 'stop-color="data:x"'));
  assert.ok(c.ok);
  assert.ok(!c.svg.includes("javascript") && !c.svg.includes("data:"));
});

test("broken markup is refused whole, never repaired", () => {
  assert.equal(cleanSvg(good.replace("</text>", "")).ok, false);
  assert.equal(cleanSvg("no drawing here").ok, false);
  assert.equal(cleanSvg(`<svg viewBox="0 0 10 10"><rect/></svg>`).ok, false, "a near-empty drawing is not a drawing");
  assert.equal(cleanSvg(good.replace("<rect", "<script>if (a<b) x()</script><rect")).ok, false);
});

test("only the first drawing is kept", () => {
  const c = cleanSvg(good + good.replace("Wash", "Second"));
  assert.ok(c.ok);
  assert.ok(!c.svg.includes("Second"));
});

test("the label is burned in and the title escaped", () => {
  const c = cleanSvg(good);
  assert.ok(c.ok);
  const out = labelled(c, "Drawn by GilbertOne.", 'Hands <b>"clean"</b>');
  assert.match(out, /Drawn by GilbertOne\./);
  assert.match(out, /<title>Hands &lt;b&gt;&quot;clean&quot;&lt;\/b&gt;<\/title>/);
  assert.match(out, /viewBox="0 0 800 6\d\d"/);
});
