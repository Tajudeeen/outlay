import test from "node:test";
import assert from "node:assert/strict";

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

const badge = (value) => {
  const safe = safeText(value);
  const v = safe.toLowerCase();
  const tone = v.includes("authoriz") || v === "active" || v === "enabled" || v === "clear" || v === "cleared" || v === "success" ? "green" : v.includes("denied") || v.includes("blocked") || v === "high" || v === "paused" || v === "disabled" ? "red" : v.includes("review") || v === "medium" ? "amber" : "slate";
  return '<span class="status-badge ' + tone + '"><i></i>' + safe + '</span>';
};

test("safeText escapes all HTML special characters", () => {
  assert.equal(safeText('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  assert.equal(safeText("User's & Co."), "User&#39;s &amp; Co.");
  assert.equal(safeText(null), "");
  assert.equal(safeText(undefined), "");
  assert.equal(safeText(123), "123");
});

test("badge helper neutralizes script injection in status labels", () => {
  const rendered = badge('<img src=x onerror=alert(1)>');
  assert.ok(!rendered.includes("<img"));
  assert.ok(rendered.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("detail row renderer escapes dangerous keys and values", () => {
  const obj = {
    malicious_key: '<script>alert(1)</script>',
    safe_key: 'normal value',
  };
  const rows = Object.entries(obj).map(([k, v]) =>
    '<div class="detail-row"><span>' + safeText(k.replaceAll("_", " ")) + '</span><b>' + safeText(v) + '</b></div>'
  ).join("");
  assert.ok(!rows.includes("<script>"));
  assert.ok(rows.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});
