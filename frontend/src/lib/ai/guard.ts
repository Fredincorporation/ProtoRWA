/**
 * Guards against the model stating compliance claims it cannot support.
 *
 * Why this exists as code rather than prompt wording:
 *
 * A real generation run produced this for a *fictional* product:
 *
 *   "HelioFrost Pro meets IEC 60705 vaccine storage standards and is certified
 *    for CE marking, ensuring it can be deployed confidently across Taiwan's
 *    most isolated clinics."
 *
 * The system prompt already said "Never invent audited figures, certifications,
 * or partner names" - and the model did it anyway. Prompt instructions are
 * advisory. Regulatory claims on a public project page are a legal and
 * reputational hazard, so they are scrubbed deterministically and the caller is
 * told it happened.
 *
 * This does NOT decide whether a claim is true; it removes phrasing that asserts
 * certification, and surfaces it so the founder can state the real status.
 */

export interface ScrubResult {
  text: string;
  /** Phrases that were removed or neutralised. */
  removed: string[];
}

/**
 * Patterns that assert third-party certification, approval or compliance.
 *
 * Deliberately broad: a false positive costs the founder one sentence they can
 * re-add deliberately, while a false negative publishes an invented certificate.
 */
const STANDARDS = String.raw`IEC|ISO|UL|FCC|ANSI|ASTM|EN|UN|CE|RoHS|REACH|MDR|ATEX|FDA|TUV|TÜV|SGS|Intertek`;

/**
 * Patterns that assert third-party certification, approval or compliance.
 *
 * Ordering matters: each pattern runs over the text left by the previous one, so
 * a broad rule placed early can consume the words a later, more specific rule
 * needs. These are ordered specific -> general, and "certified by X" is handled
 * before the standard-led rules.
 *
 * Deliberately broad: a false positive costs the founder one sentence they can
 * re-add deliberately, while a false negative publishes an invented certificate.
 *
 * Replacements must not reintroduce the standard name - an earlier placeholder
 * used "IEC 60705" as an example, so a reviewer grepping the published page
 * still found the very standard they were checking for.
 */
const CLAIM_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // "certified by TUV SUD", "was accredited by ..." - must run before the
  // standard-led rules, which would otherwise eat the verb and leave the body.
  {
    pattern: new RegExp(
      String.raw`\b(?:is|are|was|were|has\s+been|have\s+been)\s+(?:fully\s+)?(?:certified|approved|accredited|validated)\s+by\b[^.!?]*`,
      'gi',
    ),
    replacement: '[third-party approval claim removed - name the real assessor and date, or omit]',
  },
  // "meets IEC 60705", "complies with ISO 9001", "certified for CE marking".
  {
    pattern: new RegExp(
      String.raw`\b(?:meets?|satisfies?|complies?\s+with|conforms?\s+to|certified\s+(?:to|for|under)|certification\s+for)\s+(?:(?:${STANDARDS})\s*\d[\w.:-]*|(?:${STANDARDS})(?:\s+(?:marking|mark|certification|approval|compliance))?)`,
      'gi',
    ),
    replacement:
      '[certification claim removed - state the actual standard and whether certification has been obtained]',
  },
  // Prefix-form mark approvals: "CE marked", "CE approved", "RoHS compliant".
  {
    pattern: new RegExp(
      String.raw`\b(?:CE|UL|FCC|RoHS|REACH|ATEX|FDA)\s*(?:-\s*)?(?:marked|approved|compliant|certified|listed)\b[^.!?]*`,
      'gi',
    ),
    replacement: '[mark approval removed - not obtained]',
  },
  /**
   * Standalone certification references, e.g. "WHO PQS", "UN 38.3", "IP67".
   *
   * IMPORTANT: this must not fire when the sentence *states an obligation*
   * rather than a certification. Risk disclosures legitimately say "the device
   * must meet IEC 60601-2-19" - that is the risk, not a false claim. The
   * lookbehind excludes obligation framing so risk notes keep their meaning.
   */
  {
    pattern: new RegExp(
      String.raw`(?<!must\s)(?<!need\s)(?<!required\s)(?<!targeting\s)\b(?:WHO\s*PQS|UN\s*38\.3|IP\d{2})\b[^.!?]*`,
      'gi',
    ),
    replacement: '[certification reference removed - state the actual status]',
  },
  /**
   * Standards named as an achieved state, e.g. "must meet both IEC 60601-2-19
   * and IP54" - the standard is referenced after a compliance phrase, so the
   * generic standard rule above handles it. This rule catches the leftover
   * standard token when it appears without an obligation or achievement verb.
   */
  {
    pattern: new RegExp(
      String.raw`\b(?:IEC|ISO|UL|EN)\s+\d{3,5}(?:[-–]\d+)*(?![\w.-])`,
      'g',
    ),
    replacement: '[standard reference removed - state certification status explicitly]',
  },
  // Regulatory-approval phrasing.
  {
    pattern: new RegExp(
      String.raw`\b(?:regulator(?:y|ily)\s+approved|approved\s+by\s+(?:the\s+)?(?:${STANDARDS}|notified\s+body))\b[^.!?]*`,
      'gi',
    ),
    replacement: '[regulatory approval removed - not yet obtained]',
  },
  // Guarantee/warranty language about temperature or performance.
  {
    pattern:
      /\bguarantee(?:s|d|ing)?\b[^.!?]*\b(2\s*[-–]\s*8|performance|uptime|reliab\w+|temperature)\b[^.!?]*/gi,
    replacement: '[guarantee removed - describe tested behaviour instead]',
  },
  /**
   * Quantified reliability/uptime/availability promises, and "target" framing
   * that reads as a commitment.
   *
   * Added after a run produced "a 99.9 % uptime target" twice in one description.
   * The previous rule only fired on the literal word "guarantee", so an uptime
   * figure attached to "target" slipped through. An unverifiable reliability
   * number on a project page is the same hazard as a false certificate.
   */
  {
    pattern:
      /\b\d{1,3}(?:\.\d+)?\s*%\s*(?:uptime|availability|reliability|efficiency|yield)\b[^.!?]*/gi,
    replacement: '[quantified reliability figure removed — cite measured results instead]',
  },
  {
    pattern:
      /\b(?:\d{1,3}(?:\.\d+)?\s*%\s*)?(?:uptime|availability|reliability)\s+target\b[^.!?]*/gi,
    replacement: '[reliability target removed — state what has been demonstrated]',
  },
  /**
   * Absolute performance language, which the model reaches for when describing
   * prototypes: "ensures seamless", "eliminates downtime", "flawless".
   *
   * The optional-determiner form matters: an earlier version required `a|an|the`
   * before the absolute word, so "eliminating downtime" (no article) survived
   * while "eliminates the downtime" did not.
   */
  {
    pattern:
      // The bare "downtime" alternative is required: "eliminating downtime" is
      // the common phrasing, and without it only the "zero-downtime" forms matched.
      /\b(?:ensur\w*|guarantee\w*|eliminat\w*|prevent\w*|deliver\w*|provid\w*)\s+(?:(?:a|an|the|all|any)\s+)?(?:seamless|flawless|perfect|uninterrupted|downtime|zero[-\s]?downtime|downtime\s+free|100\s*%|complete\s+uptime)\b[^.!?]*/gi,
    replacement: '[absolute performance claim removed - describe observed behaviour]',
  },
  // Patent assertions, which are also trivially falsifiable.
  {
    pattern: /\bpatented\b[^.!?]*/gi,
    replacement: '[patent claim removed — cite the patent number or omit]',
  },
];

/** Strips compliance assertions from a block of generated text. */
export function scrubComplianceClaims(input: string): ScrubResult {
  let text = input;
  const removed: string[] = [];

  for (const { pattern, replacement } of CLAIM_PATTERNS) {
    // Reset lastIndex: these regexes carry the /g flag and are reused.
    pattern.lastIndex = 0;

    text = text.replace(pattern, (match) => {
      removed.push(match.trim());
      return replacement;
    });
  }

  return { text, removed };
}

/** Scrubs every string field of a generated project-copy object. */
export function scrubProjectCopy<T extends { tagline?: string; description?: string; highlights?: string[] }>(
  copy: T,
): { copy: T; removed: string[] } {
  const removed: string[] = [];

  const apply = (value: string | undefined): string | undefined => {
    if (typeof value !== 'string') return value;
    const result = scrubComplianceClaims(value);
    removed.push(...result.removed);
    return result.text;
  };

  return {
    copy: {
      ...copy,
      tagline: apply(copy.tagline),
      description: apply(copy.description),
      highlights: Array.isArray(copy.highlights)
        ? copy.highlights.map((item) => apply(item) ?? item)
        : copy.highlights,
    },
    removed,
  };
}

/** Scrubs risk notes, which also tend to assert standards compliance. */
export function scrubRiskNotes<
  T extends { risks?: Array<{ note?: string; mitigation?: string }> },
>(value: T): { value: T; removed: string[] } {
  const removed: string[] = [];

  const risks = value.risks?.map((risk) => {
    const note = typeof risk.note === 'string' ? scrubComplianceClaims(risk.note) : null;
    const mitigation =
      typeof risk.mitigation === 'string' ? scrubComplianceClaims(risk.mitigation) : null;

    if (note) removed.push(...note.removed);
    if (mitigation) removed.push(...mitigation.removed);

    return {
      ...risk,
      note: note?.text ?? risk.note,
      mitigation: mitigation?.text ?? risk.mitigation,
    };
  });

  return { value: { ...value, risks }, removed };
}
