// Run: node --experimental-strip-types lib/mctext.check.ts
import assert from "node:assert";
import { parseMc } from "./mctext.ts";

assert.deepEqual(parseMc("plain"), [{ text: "plain" }]);
assert.deepEqual(parseMc("&6&l금&r 보통"), [{ text: "금", color: "#ffaa00", bold: true }, { text: " 보통" }]);
assert.deepEqual(parseMc("&lA&cB"), [{ text: "A", bold: true }, { text: "B", color: "#ff5555" }]);
assert.deepEqual(parseMc("§aok & more"), [{ text: "ok & more", color: "#55ff55" }]);
console.log("mctext ok");
