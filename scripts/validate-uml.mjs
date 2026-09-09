import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { JSDOM } from "jsdom";

const root = process.cwd();
const umlDirectory = path.join(root, "docs", "product", "uml");
const umlReadmePath = path.join(umlDirectory, "README.md");
const umlTraceabilityDocPath = path.join(umlDirectory, "07-traceability.md");
const baselinePath = path.join(root, "docs", "product", "p0-case-baseline-v0.1.md");
const traceabilityPath = path.join(umlDirectory, "case-to-uml-v0.1.csv");
const decisionPath = path.join(root, "docs", "adr", "0002-v0.1-product-decision-baseline.md");
const diagramIdSource = String.raw`RF-UML-(?:CTX|UC|CD|SM|ACT|SEQ|CMP|DEP|SEC|REL)(?:-[A-Z0-9]+)+-\d{2}`;
const diagramIdPattern = new RegExp(`^${diagramIdSource}$`);

const fail = (message) => {
  throw new Error(message);
};
const read = (file) => fs.readFileSync(file, "utf8");

const baseline = read(baselinePath);
const decisionRecord = read(decisionPath);
const decisionRows = Array.from(
  decisionRecord.matchAll(/^\| (DEC-\d{2}) \| ([A-Z0-9_-]+) \|/gm),
  (match) => ({ id: match[1], status: match[2] }),
);
const expectedDecisionIds = Array.from(
  { length: 20 },
  (_, index) => `DEC-${String(index + 1).padStart(2, "0")}`,
);
if (
  decisionRows.length !== expectedDecisionIds.length ||
  new Set(decisionRows.map(({ id }) => id)).size !== expectedDecisionIds.length
) {
  fail("ADR-0002 must contain exactly one registry row for each of DEC-01 through DEC-20.");
}
for (const decisionId of expectedDecisionIds) {
  const decision = decisionRows.find(({ id }) => id === decisionId);
  if (!decision) fail(`ADR-0002 is missing ${decisionId}.`);
  const expectedStatus =
    decisionId === "DEC-13" ? "RESERVED_MERGED_INTO_DEC-04" : "ACCEPTED";
  if (decision.status !== expectedStatus) {
    fail(`${decisionId} must have status ${expectedStatus}, not ${decision.status}.`);
  }
}
const appendixA = baseline.split("## 附录 A：")[1]?.split("## 附录 B：")[0];
const appendixB = baseline.split("## 附录 B：")[1]?.split("## 附录 C：")[0];
const appendixC = baseline.split("## 附录 C：")[1];
if (!appendixA || !appendixB || !appendixC) {
  fail("P0 baseline appendices A, B, and C must all exist.");
}

const productCases = Array.from(
  appendixA.matchAll(/^#### ([A-Z0-9]+-P0-\d{2})\b/gm),
  (match) => match[1],
);
const securityCases = Array.from(
  appendixB.matchAll(/^\| ([A-Z]+-\d{3}) \|/gm),
  (match) => match[1],
);
const technicalCases = Array.from(
  appendixC.matchAll(/^\| ([A-Z]+-\d{3}) \|/gm),
  (match) => match[1],
);
const expectedByLayer = {
  product: productCases,
  security: securityCases,
  technical: technicalCases,
};
const expectedLayerByCase = new Map(
  Object.entries(expectedByLayer).flatMap(([layer, caseIds]) =>
    caseIds.map((caseId) => [caseId, layer]),
  ),
);
const expectedCases = [...expectedLayerByCase.keys()];
const expectedCounts = { product: 72, security: 82, technical: 100 };

for (const [layer, expected] of Object.entries(expectedCounts)) {
  if (expectedByLayer[layer].length !== expected) {
    fail(`Expected ${expected} ${layer} cases, found ${expectedByLayer[layer].length}.`);
  }
}
if (expectedLayerByCase.size !== 254) {
  fail("P0 baseline must contain exactly 254 unique case IDs.");
}

const parseCsvLine = (line) => {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) fail(`Unclosed quoted CSV field: ${line}`);
  fields.push(field);
  return fields;
};

const expectedHeader = [
  "case_id",
  "layer",
  "risk_cluster",
  "primary_diagram",
  "primary_anchor",
  "supporting_diagrams",
  "invariant_ids",
  "gold_ids",
  "review_status",
  "implementation_status",
];
const csvLines = read(traceabilityPath).trim().split(/\r?\n/);
const actualHeader = parseCsvLine(csvLines.shift());
if (actualHeader.join(",") !== expectedHeader.join(",")) {
  fail(`Unexpected traceability CSV header: ${actualHeader.join(",")}`);
}

const rows = csvLines.map((line, rowIndex) => {
  const fields = parseCsvLine(line);
  if (fields.length !== expectedHeader.length) {
    fail(
      `Traceability row ${rowIndex + 2} must have ${expectedHeader.length} fields; ` +
        `found ${fields.length}.`,
    );
  }
  const row = Object.fromEntries(
    expectedHeader.map((header, index) => [header, fields[index].trim()]),
  );
  return {
    ...row,
    supporting: row.supporting_diagrams.split(";").filter(Boolean),
    invariants: row.invariant_ids.split(";").filter(Boolean),
    gold: row.gold_ids.split(";").filter(Boolean),
  };
});

const mappedCases = rows.map((row) => row.case_id);
const mappedSet = new Set(mappedCases);
if (rows.length !== 254 || mappedSet.size !== 254) {
  fail(`Traceability must contain 254 unique rows; got ${rows.length}/${mappedSet.size}.`);
}
const missingCases = expectedCases.filter((caseId) => !mappedSet.has(caseId));
const unknownCases = mappedCases.filter((caseId) => !expectedLayerByCase.has(caseId));
if (missingCases.length || unknownCases.length) {
  fail(
    `Traceability set mismatch. Missing: ${missingCases.join(" ") || "none"}; ` +
      `unknown: ${unknownCases.join(" ") || "none"}.`,
  );
}

const diagramMarkdownFiles = fs
  .readdirSync(umlDirectory)
  .filter((file) => /^0[1-6]-.*\.md$/.test(file))
  .map((file) => path.join(umlDirectory, file));
const diagramSections = new Map();
let mermaidBlocks = 0;
const forbiddenDecisionMarkers = [
  /<<\s*(?:proposed|pending)\s+DEC-\d{2}\s*>>/i,
  /\b(?:proposed|pending)\s+DEC-\d{2}\b/i,
  /DEC-\d{2}.{0,48}(?:待确认|未接受)/,
  /(?:待确认|未接受).{0,48}DEC-\d{2}/,
];
const assertNoOpenDecisionMarker = (content, file) => {
  if (forbiddenDecisionMarkers.some((pattern) => pattern.test(content))) {
    fail(
      `Accepted UML contains a proposed or pending decision marker in ${path.relative(root, file)}.`,
    );
  }
};

for (const file of diagramMarkdownFiles) {
  const content = read(file);
  if (!/^- 状态：Accepted Design Baseline$/m.test(content)) {
    fail(`${path.relative(root, file)} must declare Accepted Design Baseline status.`);
  }
  assertNoOpenDecisionMarker(content, file);
  const fences = content.match(/^```/gm)?.length ?? 0;
  if (fences % 2 !== 0) {
    fail(`Unbalanced Markdown code fences in ${path.relative(root, file)}.`);
  }
  const rawHeadings = Array.from(
    content.matchAll(/^## (RF-UML-\S+)\b/gm),
    (match) => match[1],
  );
  for (const rawHeading of rawHeadings) {
    if (!diagramIdPattern.test(rawHeading)) {
      fail(`Malformed diagram ID ${rawHeading} in ${path.relative(root, file)}.`);
    }
  }
  const matches = Array.from(
    content.matchAll(new RegExp(`^## (${diagramIdSource})\\b`, "gm")),
  );
  for (let index = 0; index < matches.length; index += 1) {
    const diagramId = matches[index][1];
    if (diagramSections.has(diagramId)) fail(`Duplicate diagram ID: ${diagramId}`);
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? content.length;
    const section = content.slice(start, end);
    const blocks = Array.from(section.matchAll(/```mermaid\n([\s\S]*?)\n```/g));
    if (blocks.length !== 1) {
      fail(`Diagram ${diagramId} must contain exactly one Mermaid block.`);
    }
    mermaidBlocks += 1;
    const anchorList = Array.from(
      blocks[0][1].matchAll(/%%\s*@anchor\s+([A-Z][A-Z0-9_-]+)/g),
      (match) => match[1],
    );
    const anchors = new Set(anchorList);
    if (anchors.size !== anchorList.length) {
      fail(`Diagram ${diagramId} contains duplicate @anchor declarations.`);
    }
    diagramSections.set(diagramId, {
      file,
      section,
      anchors,
      mermaidSource: blocks[0][1],
    });
  }
}
if (diagramSections.size === 0 || mermaidBlocks !== diagramSections.size) {
  fail(
    `Diagram discovery failed; found ${diagramSections.size} IDs and ${mermaidBlocks} Mermaid blocks.`,
  );
}

const umlReadme = read(umlReadmePath);
if (!/^- 状态：Accepted Product and Design Baseline$/m.test(umlReadme)) {
  fail("UML README must declare Accepted Product and Design Baseline status.");
}
assertNoOpenDecisionMarker(umlReadme, umlReadmePath);
const traceabilityDoc = read(umlTraceabilityDocPath);
if (!/^- 状态：Accepted Design Baseline$/m.test(traceabilityDoc)) {
  fail("UML traceability document must declare Accepted Design Baseline status.");
}
assertNoOpenDecisionMarker(traceabilityDoc, umlTraceabilityDocPath);

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
for (const [diagramId, diagram] of diagramSections) {
  try {
    await mermaid.parse(diagram.mermaidSource);
  } catch (error) {
    fail(
      `Mermaid parse failed for ${diagramId} in ` +
        `${path.relative(root, diagram.file)}:\n${String(error)}`,
    );
  }
}
dom.window.close();

const requiredReviewStatus = "ACCEPTED";
const expectedInvariantIds = new Set(
  Array.from({ length: 12 }, (_, index) =>
    `INV-${String(index + 1).padStart(2, "0")}`,
  ),
);
const expectedGoldIds = new Set(
  Array.from({ length: 20 }, (_, index) =>
    `GOLD-${String(index + 1).padStart(2, "0")}`,
  ),
);
const referencedInvariants = new Set();
const referencedGold = new Set();
const referencedDiagrams = new Set();

const assertUniqueList = (values, label, caseId) => {
  if (new Set(values).size !== values.length) {
    fail(`${caseId} contains duplicate ${label}.`);
  }
};

for (const row of rows) {
  const expectedLayer = expectedLayerByCase.get(row.case_id);
  if (row.layer !== expectedLayer) {
    fail(`${row.case_id} must be in layer ${expectedLayer}, not ${row.layer}.`);
  }
  if (!/^RC-[A-Z0-9-]+$/.test(row.risk_cluster)) {
    fail(`${row.case_id} has invalid risk_cluster ${row.risk_cluster || "<empty>"}.`);
  }
  if (!row.primary_diagram) fail(`${row.case_id} has no primary_diagram.`);
  if (!row.primary_anchor) fail(`${row.case_id} has no primary_anchor.`);
  if (!diagramSections.has(row.primary_diagram)) {
    fail(`${row.case_id} references missing primary diagram ${row.primary_diagram}.`);
  }
  assertUniqueList(row.supporting, "supporting diagram IDs", row.case_id);
  assertUniqueList(row.invariants, "invariant IDs", row.case_id);
  assertUniqueList(row.gold, "gold IDs", row.case_id);
  if (row.supporting.includes(row.primary_diagram)) {
    fail(`${row.case_id} repeats its primary diagram in supporting_diagrams.`);
  }
  for (const supporting of row.supporting) {
    if (!diagramSections.has(supporting)) {
      fail(`${row.case_id} references missing supporting diagram ${supporting}.`);
    }
    referencedDiagrams.add(supporting);
  }
  const primary = diagramSections.get(row.primary_diagram);
  if (!primary.anchors.has(row.primary_anchor)) {
    fail(
      `${row.case_id} references missing anchor ` +
        `${row.primary_diagram}#${row.primary_anchor}.`,
    );
  }
  for (const invariantId of row.invariants) {
    if (!expectedInvariantIds.has(invariantId)) {
      fail(`${row.case_id} references unknown invariant ${invariantId}.`);
    }
    referencedInvariants.add(invariantId);
  }
  for (const goldId of row.gold) {
    if (!expectedGoldIds.has(goldId)) {
      fail(`${row.case_id} references unknown golden scenario ${goldId}.`);
    }
    referencedGold.add(goldId);
  }
  if (row.review_status !== requiredReviewStatus) {
    fail(`${row.case_id} must have review_status ${requiredReviewStatus}.`);
  }
  if (row.implementation_status !== "NOT_VERIFIED") {
    fail(`${row.case_id} must remain NOT_VERIFIED until linked tests pass.`);
  }
  referencedDiagrams.add(row.primary_diagram);
}

const setDifference = (left, right) => [...left].filter((value) => !right.has(value));
const missingInvariants = setDifference(expectedInvariantIds, referencedInvariants);
const missingGold = setDifference(expectedGoldIds, referencedGold);
if (missingInvariants.length) {
  fail(`Traceability CSV does not reference: ${missingInvariants.join(" ")}.`);
}
if (missingGold.length) {
  fail(`Traceability CSV does not reference: ${missingGold.join(" ")}.`);
}
for (const requiredDiagram of ["RF-UML-REL-MUT-01", "RF-UML-REL-SAGA-01"]) {
  if (!referencedDiagrams.has(requiredDiagram)) {
    fail(`Critical reliability diagram is not referenced by any Case: ${requiredDiagram}.`);
  }
}
const unreferencedDiagrams = [...diagramSections.keys()].filter(
  (diagramId) => !referencedDiagrams.has(diagramId),
);
if (unreferencedDiagrams.length) {
  fail(`Diagrams without any Case reference: ${unreferencedDiagrams.join(" ")}.`);
}

const validateTraceTable = (pattern, expectedIds, label) => {
  const matches = Array.from(traceabilityDoc.matchAll(pattern));
  const ids = matches.map((match) => match[1]);
  if (ids.length !== expectedIds.size || new Set(ids).size !== expectedIds.size) {
    fail(`${label} table must contain ${expectedIds.size} unique rows.`);
  }
  for (const id of expectedIds) {
    if (!ids.includes(id)) fail(`${label} table is missing ${id}.`);
  }
  for (const match of matches) {
    const diagramIds = Array.from(
      match[0].matchAll(new RegExp(diagramIdSource, "g")),
      (diagramMatch) => diagramMatch[0],
    );
    if (diagramIds.length === 0) fail(`${match[1]} has no diagram mapping.`);
    for (const diagramId of diagramIds) {
      if (!diagramSections.has(diagramId)) {
        fail(`${match[1]} references missing diagram ${diagramId}.`);
      }
    }
  }
};
validateTraceTable(/^\| (GOLD-\d{2}) \|.*$/gm, expectedGoldIds, "Golden scenario");
validateTraceTable(/^\| (INV-\d{2})\b.*$/gm, expectedInvariantIds, "Invariant");

const allMarkdown = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name.endsWith(".md")) allMarkdown.push(absolute);
  }
};
walk(root);

const brokenLinks = [];
for (const file of allMarkdown) {
  const content = read(file);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target);
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      brokenLinks.push(`${path.relative(root, file)} -> ${match[1]}`);
    }
  }
}
if (brokenLinks.length) {
  fail(`Broken local Markdown links:\n${brokenLinks.join("\n")}`);
}

const reviewedByStatus = rows.reduce((counts, row) => {
  counts[row.review_status] = (counts[row.review_status] ?? 0) + 1;
  return counts;
}, {});
const implementedByStatus = rows.reduce((counts, row) => {
  counts[row.implementation_status] = (counts[row.implementation_status] ?? 0) + 1;
  return counts;
}, {});
console.log(
  [
    "RoleFox UML validation passed.",
    `Cases: ${rows.length} (product ${productCases.length}, security ${securityCases.length}, technical ${technicalCases.length})`,
    `Diagrams discovered: ${diagramSections.size}`,
    `Mermaid diagrams parsed: ${diagramSections.size}`,
    `Case-referenced diagrams: ${referencedDiagrams.size}`,
    `Design review status: ${Object.entries(reviewedByStatus)
      .map(([status, count]) => `${status} ${count}`)
      .join(", ")}`,
    `Implementation status: ${Object.entries(implementedByStatus)
      .map(([status, count]) => `${status} ${count}`)
      .join(", ")}`,
    `Accepted decision registry: ${decisionRows.length} stable IDs (19 accepted, 1 reserved)`,
    "Accepted UML status headers: 01-07 and README",
    `Golden scenarios referenced: ${referencedGold.size}`,
    `System invariants referenced: ${referencedInvariants.size}`,
    `Markdown files checked: ${allMarkdown.length}`,
  ].join("\n"),
);
