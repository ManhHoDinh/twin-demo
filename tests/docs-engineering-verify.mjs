import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINEERING_DIR = path.join(ROOT, 'docs', '07-engineering');

const REQUIRED_FILES = [
  'README.md',
  '01-scientific-architecture.md',
  '02-simulation-architecture.md',
  '03-engine-contract-catalog.md',
  '04-hydrology-model.md',
  '05-hydraulic-model.md',
  '06-reservoir-model.md',
  '07-river-network-model.md',
  '08-data-pipeline.md',
  '09-gis-architecture.md',
  '10-3d-rendering-pipeline.md',
  '11-lod-and-gpu-optimisation.md',
  '12-visualisation-and-animation-rules.md',
  '13-decision-engine.md',
  '14-calibration-and-validation.md',
  '15-verification-strategy.md',
  '16-performance-targets.md',
  '17-engineering-risks-and-open-questions.md',
  '18-requirement-traceability.md',
];

const ENGINES = [
  'Terrain',
  'Hydrology',
  'Hydraulic',
  'Weather',
  'Reservoir',
  'River Network',
  'Flood Propagation',
  'Digital Twin',
  'Scenario',
  'Decision Support',
  'AI Explanation',
  'Visualization',
];

const CONTRACT_FIELDS = [
  'Purpose and scope',
  'Scientific and implementation status',
  'Inputs',
  'Outputs',
  'Dependencies and allowed dependency direction',
  'Accepted alternatives and recommended method',
  'Governing equations and implementation form',
  'Variables, units, parameters and bounds',
  'Data structures and serialization',
  'Update cadence and triggering events',
  'Spatial and temporal resolution',
  'Complexity and resource use',
  'Initialization, warm-up and boundary conditions',
  'Calibration method and observations',
  'Validation metrics, datasets and acceptance thresholds',
  'Verification tests and invariants',
  'Visualization derived from measurable state',
  'Assumptions and limitations',
  'Failure detection, degraded behavior and recovery',
  'Future extensions and scientific prerequisites',
  'Implementation evidence and traceability',
  'Next',
];

const SCIENTIFIC_STATUSES = [
  'IMPLEMENTED',
  'PLANNED',
  'REFERENCE MODEL',
  'REQUIRES DOMAIN REVIEW',
];

const PROVENANCE_VALUES = ['MEASURED', 'FORECAST', 'MODELLED', 'ASSUMED', 'SYNTHETIC'];
const SPECIALIZED_CONTRACTS = [
  '04-hydrology-model.md',
  '05-hydraulic-model.md',
  '06-reservoir-model.md',
  '07-river-network-model.md',
  '13-decision-engine.md',
];

const errors = [];
const documents = new Map();

function report(message) {
  errors.push(message);
}

function normalize(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripIgnoredMarkdown(markdown) {
  const kept = [];
  let fence = null;
  let inIndentedCode = false;
  let listContentIndent = null;
  let previousLineBlank = true;
  const leadingIndentation = (line) => {
    const value = line.match(/^[ \t]*/)[0];
    let columns = 0;
    for (const character of value) {
      columns = character === '\t' ? columns + (4 - (columns % 4)) : columns + 1;
    }
    return { characters: value.length, columns };
  };
  const indentationWidth = (line) => leadingIndentation(line).columns;
  const fenceMarker = (line) => {
    const topLevel = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (topLevel) return topLevel;

    const explicitContainer = line.match(/^(?:(?: {0,3}>[ \t]{0,3})+|(?: {0,3}>[ \t]{0,3})* {0,3}(?:[-+*]|\d+[.)])[ \t]{1,3})(`{3,}|~{3,})(.*)$/);
    if (explicitContainer) return explicitContainer;

    if (listContentIndent !== null) {
      const leading = leadingIndentation(line);
      if (leading.columns >= listContentIndent && leading.columns <= listContentIndent + 3) {
        return line.slice(leading.characters).match(/^(`{3,}|~{3,})(.*)$/);
      }
    }
    return null;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const marker = fenceMarker(line);
    if (!fence && marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      continue;
    }
    const closesFence = fence
      && marker
      && marker[1][0] === fence.char
      && marker[1].length >= fence.length
      && marker[2].trim() === '';
    if (closesFence) {
      fence = null;
      continue;
    }
    if (fence) continue;

    if (!line.trim()) {
      kept.push(line);
      previousLineBlank = true;
      continue;
    }

    const indent = indentationWidth(line);
    const listMarker = line.match(/^([ \t]{0,3})(?:[-+*]|\d+[.)])([ \t]+)/);
    if (listMarker) {
      listContentIndent = indentationWidth(listMarker[1])
        + listMarker[0].length - listMarker[1].length;
      inIndentedCode = false;
    } else if (listContentIndent !== null && indent >= listContentIndent) {
      if (indent >= listContentIndent + 4) {
        inIndentedCode = true;
        previousLineBlank = false;
        continue;
      }
      inIndentedCode = false;
    } else {
      listContentIndent = null;
      if (inIndentedCode && indent >= 4) {
        previousLineBlank = false;
        continue;
      }
      inIndentedCode = false;
      if (indent >= 4 && previousLineBlank) {
        inIndentedCode = true;
        previousLineBlank = false;
        continue;
      }
    }

    kept.push(line);
    previousLineBlank = false;
  }
  return kept.join('\n').replace(/<!--[\s\S]*?-->/g, '');
}

function structuralLabels(markdown) {
  const clean = stripIgnoredMarkdown(markdown);
  const labels = [];
  for (const match of clean.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) labels.push(match[1]);
  for (const { rows } of parseTable(clean)) {
    for (const row of rows) {
      const cells = row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
      if (cells[0]?.trim()) labels.push(cells[0].trim());
    }
  }
  return labels.map((label) => label.replace(/<[^>]+>/g, '').replace(/[*_~`]/g, '').trim());
}

function missingContractFields(markdown) {
  const labels = structuralLabels(markdown).map(normalize);
  return CONTRACT_FIELDS.filter((field) => {
    const expected = normalize(field);
    return !labels.some((label) => label === expected || label.endsWith(` ${expected}`));
  });
}

function metadataValues(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`, 'gim');
  return [...stripIgnoredMarkdown(markdown).matchAll(pattern)]
    .map((match) => match[1].replace(/[*`]/g, '').trim());
}

function tableMetadataValues(markdown, label) {
  const expected = normalize(label);
  return parseTable(markdown).flatMap(({ rows }) => rows.flatMap((row) => {
    const cells = tableCells(row);
    if (normalize(cells[0] ?? '') !== expected || !cells[1]?.trim()) return [];
    return [cells[1].replace(/<[^>]+>/g, '').replace(/[*`]/g, '').trim()];
  }));
}

function validStatusMetadata(markdown) {
  const tableStatuses = tableMetadataValues(markdown, 'Status');
  const tableScientificStatuses = tableMetadataValues(markdown, 'Scientific status');
  const tableImplementationStatuses = tableMetadataValues(markdown, 'Implementation status');
  if (tableStatuses.length || tableScientificStatuses.length || tableImplementationStatuses.length) {
    return tableStatuses.length === 1
      && SCIENTIFIC_STATUSES.includes(tableStatuses[0])
      && tableScientificStatuses.length === 0
      && tableImplementationStatuses.length === 0;
  }

  const statusBlocks = metadataValues(markdown, 'Status');
  const scientificStatusBlocks = metadataValues(markdown, 'Scientific status');
  const implementationStatusBlocks = metadataValues(markdown, 'Implementation status');
  const isAllowed = (value) => SCIENTIFIC_STATUSES.includes(value);
  const hasSingleStatus = statusBlocks.length === 1
    && isAllowed(statusBlocks[0])
    && scientificStatusBlocks.length === 0
    && implementationStatusBlocks.length === 0;
  const hasPairedStatus = statusBlocks.length === 0
    && scientificStatusBlocks.length === 1
    && isAllowed(scientificStatusBlocks[0])
    && implementationStatusBlocks.length === 1
    && isAllowed(implementationStatusBlocks[0]);
  return hasSingleStatus || hasPairedStatus;
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();
  for (const match of stripIgnoredMarkdown(markdown).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    if (slug) {
      const count = occurrences.get(slug) ?? 0;
      anchors.add(count ? `${slug}-${count}` : slug);
      occurrences.set(slug, count + 1);
    }
  }
  for (const match of stripIgnoredMarkdown(markdown).matchAll(/<a\s+(?:name|id)=["']([^"']+)["']/gi)) anchors.add(match[1]);
  return anchors;
}

function normalizeReferenceLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function linkTarget(value) {
  let target = value.trim();
  if (target.startsWith('<')) {
    const end = target.indexOf('>');
    if (end !== -1) target = target.slice(1, end);
  } else {
    target = target.split(/\s+(?:["'(])/)[0];
  }
  return target;
}

function markdownLinks(markdown, definitionsMarkdown = markdown) {
  const clean = stripIgnoredMarkdown(markdown);
  const definitionsClean = stripIgnoredMarkdown(definitionsMarkdown);
  const definitions = new Map();
  const definitionRanges = [];
  const definitionPattern = /^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*(<[^>\n]*>|\S+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^\)\n]*\)))?[ \t]*$/gm;
  for (const match of definitionsClean.matchAll(definitionPattern)) {
    definitions.set(normalizeReferenceLabel(match[1]), linkTarget(match[2]));
    if (definitionsMarkdown === markdown) {
      definitionRanges.push([match.index, match.index + match[0].length]);
    }
  }

  const targets = [];
  const missingReferences = [];
  const pattern = /(?<![!\]])\[([^\]\n]+)\](?:\(([^)\n]+)\)|\[([^\]\n]*)\])?/g;
  for (const match of clean.matchAll(pattern)) {
    if (definitionRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    if (match[2] !== undefined) {
      const target = linkTarget(match[2]);
      if (target && !/^(?:[a-z]+:|\/\/)/i.test(target)) targets.push(target);
      continue;
    }

    const explicitReference = match[3] !== undefined;
    const reference = normalizeReferenceLabel(explicitReference && match[3] ? match[3] : match[1]);
    if (!definitions.has(reference)) {
      if (explicitReference) missingReferences.push(reference);
      continue;
    }
    const target = definitions.get(reference);
    if (target && !/^(?:[a-z]+:|\/\/)/i.test(target)) targets.push(target);
  }
  return { targets, missingReferences };
}

function localLinks(markdown, definitionsMarkdown = markdown) {
  return markdownLinks(markdown, definitionsMarkdown).targets;
}

function resolveLocalLink(sourceFile, target) {
  const hashIndex = target.indexOf('#');
  const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const rawAnchor = hashIndex === -1 ? '' : target.slice(hashIndex + 1);
  let decodedPath;
  let decodedAnchor;
  try {
    decodedPath = decodeURIComponent(rawPath);
    decodedAnchor = decodeURIComponent(rawAnchor);
  } catch {
    return { error: `malformed link ${target}` };
  }
  if (decodedPath && path.isAbsolute(decodedPath)) return { error: `absolute target ${target}` };
  const targetFile = decodedPath
    ? path.resolve(path.dirname(sourceFile), decodedPath)
    : sourceFile;
  const relative = path.relative(ROOT, targetFile);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return { error: `target outside repository ${target}` };
  }
  let targetStat;
  try {
    targetStat = fs.statSync(targetFile);
  } catch {
    return { error: `missing target ${target}` };
  }
  if (!targetStat.isFile()) return { error: `target is not a file ${target}` };
  const realTarget = fs.realpathSync(targetFile);
  const realRoot = fs.realpathSync(ROOT);
  const realRelative = path.relative(realRoot, realTarget);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    return { error: `target outside repository ${target}` };
  }
  if (decodedAnchor && path.extname(targetFile).toLowerCase() === '.md') {
    const targetMarkdown = fs.readFileSync(targetFile, 'utf8');
    if (!headingAnchors(targetMarkdown).has(decodedAnchor.toLowerCase())) {
      return { error: `missing anchor ${target}` };
    }
  }
  return { targetFile, realTarget };
}

function sectionForEngine(markdown, engine, followingEngines) {
  markdown = stripIgnoredMarkdown(markdown);
  const heading = new RegExp(`^#{2,6}\\s+(?:[^\\n]*?\\b)?${engine.replace(/ /g, '\\s+')}\\s+(?:Engine\\b[^\\n]*)?$`, 'im');
  const match = heading.exec(markdown);
  if (!match) return null;
  const start = match.index;
  let end = markdown.length;
  for (const other of followingEngines) {
    const otherHeading = new RegExp(`^#{2,6}\\s+(?:[^\\n]*?\\b)?${other.replace(/ /g, '\\s+')}\\s+(?:Engine\\b[^\\n]*)?$`, 'im');
    const candidate = otherHeading.exec(markdown.slice(start + match[0].length));
    if (candidate) end = Math.min(end, start + match[0].length + candidate.index);
  }
  return markdown.slice(start, end);
}

function validateContract(markdown, label) {
  const missing = missingContractFields(markdown);
  if (missing.length) report(`${label}: missing contract fields: ${missing.join('; ')}`);
}

function parseTable(markdown) {
  const lines = stripIgnoredMarkdown(markdown).split(/\r?\n/);
  const tables = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes('|') || !lines[index + 1].includes('|')) continue;
    const headerCells = tableCells(lines[index]);
    const delimiterCells = tableCells(lines[index + 1]);
    if (headerCells.length !== delimiterCells.length
      || !delimiterCells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].includes('|')) {
      rows.push(lines[cursor]);
      cursor += 1;
    }
    tables.push({ header: lines[index], rows });
    index = cursor - 1;
  }
  return tables;
}

function tableCells(row) {
  const value = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\' && value[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function implementedRowHasEvidence(header, row, sourceFile, definitionsMarkdown = row) {
  const headers = tableCells(header).map(normalize);
  const cells = tableCells(row);
  const statusIndex = headers.findIndex((value) => value === 'status' || value === 'implementation status');
  const evidenceIndex = headers.findIndex((value) => value === 'validation evidence');
  if (statusIndex === -1) return !cells.some((cell) => normalize(cell) === 'implemented');
  const visibleStatus = (cells[statusIndex] ?? '').replace(/<[^>]+>/g, '');
  if (normalize(visibleStatus) !== 'implemented') return true;
  if (evidenceIndex === -1) return false;
  const realSource = fs.existsSync(sourceFile) ? fs.realpathSync(sourceFile) : path.resolve(sourceFile);
  return localLinks(cells[evidenceIndex] ?? '', definitionsMarkdown).some((target) => {
    const resolved = resolveLocalLink(sourceFile, target);
    return !resolved.error && resolved.realTarget !== realSource;
  });
}

function runSelfTest() {
  const cases = [];
  const record = (name, rejected) => cases.push({ name, rejected });

  const hiddenStatus = [
    '```markdown',
    '**Status:** INVALID',
    '```',
    '<!-- IMPLEMENTED PLANNED REFERENCE MODEL REQUIRES DOMAIN REVIEW -->',
  ].join('\n');
  const cleanStatus = stripIgnoredMarkdown(hiddenStatus);
  const statusAccepted = validStatusMetadata(hiddenStatus)
    || SCIENTIFIC_STATUSES.every((status) => cleanStatus.includes(status));
  record('rejects status metadata in fences and vocabulary in comments', !statusAccepted);

  const validMetadataTable = [
    '| Field | Value |',
    '|---|---|',
    '| Document ID | ENG-TEST |',
    '| Status | REFERENCE MODEL |',
  ].join('\n');
  record('accepts a single structural metadata table',
    tableMetadataValues(validMetadataTable, 'Document ID').length === 1
      && validStatusMetadata(validMetadataTable));

  const conflictingMetadataTable = [
    '| Field | Value |',
    '|---|---|',
    '| Document ID | ENG-TEST |',
    '| Status | REFERENCE MODEL |',
    '| Document ID | ENG-OTHER |',
    '| Status | INVALID |',
  ].join('\n');
  record('rejects duplicate conflicting table metadata and invalid status',
    tableMetadataValues(conflictingMetadataTable, 'Document ID').length === 2
      && !validStatusMetadata(conflictingMetadataTable));

  const commentedContract = `<!--\n${CONTRACT_FIELDS.join('\n')}\n-->`;
  const contractAccepted = missingContractFields(commentedContract).length === 0;
  record('rejects contract labels that exist only in comments', !contractAccepted);

  const sourceFile = path.join(ENGINEERING_DIR, '18-requirement-traceability.md');
  const traversalTarget = path.relative(path.dirname(sourceFile), '/etc/passwd');
  const absoluteAccepted = !resolveLocalLink(sourceFile, '/etc/passwd').error;
  const traversalAccepted = !resolveLocalLink(sourceFile, traversalTarget).error;
  const directoryAccepted = !resolveLocalLink(sourceFile, '../..').error;
  record('rejects absolute, repository-external and directory evidence', !absoluteAccepted && !traversalAccepted && !directoryAccepted);

  const structuralContract = CONTRACT_FIELDS.map((field) => `### ${field}`).join('\n\n');
  record('accepts real structural fields and allowed status metadata',
    missingContractFields(structuralContract).length === 0 && validStatusMetadata(validMetadataTable));

  const duplicateAnchors = headingAnchors('# Repeated heading\n\n# Repeated heading');
  record('supports duplicate GitHub-style heading anchors', duplicateAnchors.has('repeated-heading-1'));

  const longFence = [
    '````markdown',
    '```',
    '**Status:** `PLANNED`',
    ...CONTRACT_FIELDS.map((field) => `### ${field}`),
    '````',
  ].join('\n');
  record('keeps shorter same-character fences inside their opening fence',
    !validStatusMetadata(longFence) && missingContractFields(longFence).length === CONTRACT_FIELDS.length);

  record('rejects status metadata in indented code blocks',
    !validStatusMetadata('    **Status:** PLANNED'));
  record('rejects status metadata in tab-indented code blocks',
    !validStatusMetadata('\t**Status:** PLANNED'));
  const indentedContract = [
    '    | Contract field | Value |',
    '    | --- | --- |',
    ...CONTRACT_FIELDS.map((field) => `    | ${field} | placeholder |`),
  ].join('\n');
  record('rejects contract labels in indented code blocks',
    missingContractFields(indentedContract).length === CONTRACT_FIELDS.length);
  record('keeps legitimate list continuation content',
    validStatusMetadata('- Contract metadata:\n    **Status:** PLANNED'));

  const fourSpacePseudoFence = [
    '**Status:** PLANNED',
    '    ````markdown',
    '**Status:** PLANNED',
    '[missing evidence](missing-evidence.md)',
    '    ````',
  ].join('\n');
  const pseudoFenceLinks = markdownLinks(fourSpacePseudoFence);
  record('does not let four-space pseudo-fences hide duplicate status or broken links',
    !validStatusMetadata(fourSpacePseudoFence)
      && pseudoFenceLinks.targets.some((target) => resolveLocalLink(sourceFile, target).error));

  const nestedFence = [
    '- Example contract:',
    '',
    '    ```markdown',
    '    **Status:** PLANNED',
    '    | Contract field | Value |',
    '    | --- | --- |',
    ...CONTRACT_FIELDS.map((field) => `    | ${field} | placeholder |`),
    '    ```',
  ].join('\n');
  record('rejects status and contract tables inside list-nested fences',
    !validStatusMetadata(nestedFence)
      && missingContractFields(nestedFence).length === CONTRACT_FIELDS.length);

  const tabIndentedListFence = [
    '- Example contract:',
    '',
    '\t```markdown',
    '\t**Status:** PLANNED',
    '\t```',
  ].join('\n');
  record('rejects status metadata inside tab-indented list fences',
    !validStatusMetadata(tabIndentedListFence));

  const malformedTables = [
    '| Field | Value |\n| --- | not-a-separator |\n| Purpose and scope | placeholder |',
    '| Field | Value |\n| --- | --- | --- |\n| Purpose and scope | placeholder |',
  ];
  record('rejects malformed Markdown pseudo-tables',
    malformedTables.every((table) => parseTable(table).length === 0));

  const missingReference = typeof markdownLinks === 'function'
    ? markdownLinks('[evidence][missing]')
    : { missingReferences: [] };
  record('rejects reference links with missing definitions',
    missingReference.missingReferences.includes('missing'));

  const externalReference = typeof markdownLinks === 'function'
    ? markdownLinks('[evidence][outside]\n\n[outside]: /etc/passwd')
    : { targets: [] };
  record('rejects repository-external reference link targets',
    externalReference.targets.some((target) => resolveLocalLink(sourceFile, target).error));

  const referenceForms = typeof markdownLinks === 'function'
    ? markdownLinks([
      '[full][target]',
      '[target][]',
      '[target]',
      '![image][target]',
      '',
      '[target]: ../../package.json',
    ].join('\n'))
    : { targets: [] };
  record('parses full, collapsed and shortcut references without treating images as links',
    referenceForms.targets.filter((target) => target === '../../package.json').length === 3);

  const traceabilityHeader = '| Requirement | Canonical document | Status | Validation evidence |';
  const misplacedEvidence = '| R-1 | [package](../../package.json) | IMPLEMENTED | |';
  record('requires IMPLEMENTED evidence in the Validation evidence column',
    !implementedRowHasEvidence(traceabilityHeader, misplacedEvidence, sourceFile));
  const validEvidence = '| R-2 | [package](../../package.json) | IMPLEMENTED | [verifier](../../tests/docs-engineering-verify.mjs) |';
  record('accepts repository evidence in the Validation evidence column',
    implementedRowHasEvidence(traceabilityHeader, validEvidence, sourceFile));
  const wrappedStatus = '| R-3 | [package](../../package.json) | <span>IMPLEMENTED</span> | |';
  record('requires evidence for HTML-wrapped IMPLEMENTED status',
    !implementedRowHasEvidence(traceabilityHeader, wrappedStatus, sourceFile));

  const failures = cases.filter(({ rejected }) => !rejected);
  if (failures.length) {
    console.error(`Engineering documentation verifier self-test failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure.name}: adversarial fixture was accepted`);
    process.exitCode = 1;
  } else {
    console.log(`Engineering documentation verifier self-test passed (${cases.length} adversarial cases).`);
  }
}

function verifyDocumentation() {
  const missingFiles = REQUIRED_FILES.filter((name) => !fs.existsSync(path.join(ENGINEERING_DIR, name)));
  if (missingFiles.length) {
    for (const name of missingFiles) report(`missing docs/07-engineering/${name}`);
  } else {
    for (const name of REQUIRED_FILES) {
      const file = path.join(ENGINEERING_DIR, name);
      documents.set(name, fs.readFileSync(file, 'utf8'));
    }

    const ids = new Map();
    for (const [name, markdown] of documents) {
      const documentIds = tableMetadataValues(markdown, 'Document ID');
      if (documentIds.length !== 1) {
        report(`${name}: expected exactly one Document ID`);
      } else if (ids.has(documentIds[0])) {
        report(`${name}: duplicate Document ID ${documentIds[0]} (also in ${ids.get(documentIds[0])})`);
      } else {
        ids.set(documentIds[0], name);
      }

      if (tableMetadataValues(markdown, 'Status').length !== 1 || !validStatusMetadata(markdown)) {
        report(`${name}: expected exactly one allowed Status row in the metadata table`);
      }

      const links = markdownLinks(markdown);
      for (const reference of links.missingReferences) {
        report(`${name}: missing link reference definition ${reference}`);
      }
      for (const target of links.targets) {
        const result = resolveLocalLink(path.join(ENGINEERING_DIR, name), target);
        if (result.error) report(`${name}: ${result.error}`);
      }
    }

    const corpus = stripIgnoredMarkdown([...documents.values()].join('\n'));
    for (const status of SCIENTIFIC_STATUSES) {
      if (!new RegExp(`\\b${status.replace(/ /g, '\\s+')}\\b`).test(corpus)) report(`missing scientific status ${status}`);
    }
    for (const provenance of PROVENANCE_VALUES) {
      if (!new RegExp(`\\b${provenance}\\b`).test(corpus)) report(`missing provenance value ${provenance}`);
    }

    const catalog = documents.get('03-engine-contract-catalog.md');
    for (let index = 0; index < ENGINES.length; index += 1) {
      const engine = ENGINES[index];
      const section = sectionForEngine(catalog, engine, ENGINES.filter((_, otherIndex) => otherIndex !== index));
      if (!section) {
        report(`03-engine-contract-catalog.md: missing ${engine} Engine section`);
      } else {
        validateContract(section, `03-engine-contract-catalog.md: ${engine} Engine`);
      }
    }
    for (const name of SPECIALIZED_CONTRACTS) validateContract(documents.get(name), name);

    const traceability = documents.get('18-requirement-traceability.md');
    const traceabilityTables = parseTable(traceability).filter(({ header }) => /requirement/i.test(header));
    const traceabilityRows = traceabilityTables.flatMap(({ rows }) => rows).filter((row) => !/^\s*\|?\s*$/.test(row));
    if (!traceabilityRows.length) report('18-requirement-traceability.md: no requirement traceability rows');
    const traceabilityFile = path.join(ENGINEERING_DIR, '18-requirement-traceability.md');
    for (const table of traceabilityTables) {
      for (const row of table.rows) {
        if (!implementedRowHasEvidence(table.header, row, traceabilityFile, traceability)) {
          report(`18-requirement-traceability.md: IMPLEMENTED row lacks existing evidence: ${row.trim()}`);
        }
      }
    }
  }

  if (errors.length) {
    console.error(`Engineering documentation verification failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Engineering documentation verification passed (${REQUIRED_FILES.length} documents, ${ENGINES.length} engines).`);
  }
}

if (process.argv.includes('--self-test')) runSelfTest();
else verifyDocumentation();
