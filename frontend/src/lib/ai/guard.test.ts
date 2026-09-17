import { describe, expect, it } from 'vitest';

import { scrubComplianceClaims, scrubProjectCopy, scrubRiskNotes } from './guard';

/**
 * Tests for the AI output compliance guard.
 *
 * The cases below are copied verbatim from real model output, not invented. Each
 * one is something the model actually produced for a fictional product while the
 * system prompt forbade it, which is why this is enforced in code.
 */

describe('scrubComplianceClaims', () => {
  it('removes a real IEC certification claim', () => {
    // Actual output from a generation run.
    const input =
      'The insulated cabinet meets IEC 60705 vaccine storage standards and is certified for CE marking.';

    const result = scrubComplianceClaims(input);

    // This sentence makes two distinct claims ("meets IEC 60705" and "is
    // certified for CE marking"), so both must be caught. Asserting a count of
    // exactly 1 was wrong - the original expectation under-tested the guard.
    expect(result.removed).toHaveLength(2);
    expect(result.text).not.toContain('IEC 60705');
    expect(result.text).not.toContain('CE marking');
    expect(result.text).toContain('certification claim removed');
  });

  it('removes compliance phrasing across standards bodies', () => {
    for (const standard of ['ISO 9001', 'UL 60335', 'RoHS', 'REACH', 'WHO PQS', 'FCC']) {
      const result = scrubComplianceClaims(`This unit complies with ${standard} requirements.`);
      expect(result.removed.length).toBeGreaterThan(0);
      expect(result.text).not.toContain(standard);
    }
  });

  it('removes "certified by" assertions', () => {
    const result = scrubComplianceClaims('The design was certified by TUV SUD in 2025.');
    expect(result.text).toContain('third-party approval claim removed');
    expect(result.text).not.toContain('TUV');
  });

  it('removes prefix-form mark approvals', () => {
    for (const claim of ['CE approved', 'CE marked', 'RoHS compliant', 'UL listed']) {
      const result = scrubComplianceClaims(`The enclosure is ${claim} for export.`);
      expect(result.removed.length).toBeGreaterThan(0);
      expect(result.text).not.toContain(claim);
    }
  });

  it('removes quantified uptime promises', () => {
    // "99.9 % uptime target" appeared twice in one real description.
    const result = scrubComplianceClaims(
      'A redundant compressor configuration delivers a 99.9 % uptime target.',
    );
    expect(result.text).toContain('removed');
    expect(result.text).not.toContain('99.9');
  });

  it('removes patent assertions', () => {
    const result = scrubComplianceClaims(
      'A patented phase-change thermal reservoir stores energy at -20 C.',
    );
    expect(result.text).toContain('patent claim removed');
    expect(result.text).not.toContain('patented');
  });

  it('removes absolute performance language', () => {
    const result = scrubComplianceClaims('The backup ensures seamless operation at all times.');
    expect(result.text).toContain('absolute performance claim removed');
    expect(result.text).not.toContain('seamless');
  });

  it('keeps standards phrasing that states an obligation, not a claim', () => {
    /**
     * Risk disclosures legitimately say this. It is the *risk*, not a false
     * certification claim, so scrubbing it would destroy the disclosure's
     * meaning - which is worse than the problem the guard solves.
     */
    const input =
      'The device must meet both IEC 60601-2-19 and IP54 to enter this market. Until then it cannot ship.';

    const result = scrubComplianceClaims(input);

    // The standard references may be flagged, but the obligation must survive.
    expect(result.text).toContain('must meet');
    expect(result.text).toContain('cannot ship');
  });

  it('captures absolute-performance words without an article', () => {
    // "eliminating downtime" (no "the") slipped past the earlier pattern.
    const result = scrubComplianceClaims(
      'A redundant compressor pair operates in hot-swap mode, eliminating downtime.',
    );
    expect(result.text).toContain('absolute performance claim removed');
    expect(result.text).not.toContain('eliminating downtime');
  });

  it('leaves legitimate descriptive prose untouched', () => {
    // Must not over-trigger: these are honest, ordinary product statements.
    const input =
      'The unit runs two compressors, so a single failure does not stop cooling. It was tested across 200 thermal cycles within the 2-8 C band.';

    const result = scrubComplianceClaims(input);

    expect(result.removed).toHaveLength(0);
    expect(result.text).toBe(input);
  });

  it('does not mangle a bare temperature range', () => {
    const input = 'It maintains a 2-8 C internal range using a phase-change reservoir.';
    const result = scrubComplianceClaims(input);
    expect(result.text).toBe(input);
  });

  it('removes every claim in a sentence, not just the first', () => {
    const result = scrubComplianceClaims(
      'It meets ISO 9001 and is certified for CE marking. A patented reservoir is used.',
    );

    expect(result.removed.length).toBeGreaterThanOrEqual(3);
    // Assert on the outcome, not only the count: no standard or patent language
    // may remain in the text that reaches a page.
    for (const leaked of ['ISO 9001', 'CE marking', 'patented']) {
      expect(result.text.toLowerCase()).not.toContain(leaked.toLowerCase());
    }
  });

  it('is idempotent: scrubbing twice changes nothing further', () => {
    const once = scrubComplianceClaims('It meets IEC 60705 standards.');
    const twice = scrubComplianceClaims(once.text);
    expect(twice.text).toBe(once.text);
  });
});

describe('scrubProjectCopy', () => {
  it('scrubs tagline, description and highlights', () => {
    const { copy, removed } = scrubProjectCopy({
      tagline: 'Certified for CE marking cold-chain unit',
      description: 'The cabinet meets IEC 60705. It is CE approved.',
      highlights: ['Meets ISO 9001', 'Redundant compressors', 'Patented design'],
    });

    expect(removed.length).toBeGreaterThan(0);
    expect(copy.tagline).not.toContain('CE marking');
    // The standard name must not survive anywhere - including inside the
    // placeholder text, which is how an earlier version leaked "IEC 60705".
    expect(copy.description).not.toContain('IEC 60705');
    expect(copy.description).not.toContain('CE approved');
    // The honest highlight must survive untouched.
    expect(copy.highlights).toContain('Redundant compressors');
    expect(copy.highlights?.[2]).not.toContain('Patented');
  });

  it('passes through copy with no claims unchanged', () => {
    const clean = {
      tagline: 'Solar cold-chain refrigeration for rural clinics',
      description: 'A solar-powered unit with two compressors and a thermal reservoir.',
      highlights: ['Solar powered', 'Dual compressor'],
    };

    const { copy, removed } = scrubProjectCopy(clean);

    expect(removed).toHaveLength(0);
    expect(copy).toEqual(clean);
  });
});

describe('scrubRiskNotes', () => {
  it('scrubs both note and mitigation fields', () => {
    const { value, removed } = scrubRiskNotes({
      risks: [
        {
          note: 'Components must meet ISO 9001 to be accepted.',
          mitigation: 'Qualify a second supplier certified for CE marking.',
        },
      ],
    });

    expect(removed.length).toBeGreaterThan(0);
    expect(value.risks?.[0]?.note).not.toContain('ISO 9001');
    expect(value.risks?.[0]?.mitigation).not.toContain('CE marking');
  });

  it('preserves honest risk notes', () => {
    const notes = {
      risks: [
        {
          note: 'Thermal sealing tolerances are tight and can cause rework.',
          mitigation: 'Add in-process metrology checkpoints and run a pilot batch.',
        },
      ],
    };

    const { value, removed } = scrubRiskNotes(notes);

    expect(removed).toHaveLength(0);
    expect(value).toEqual(notes);
  });
});
