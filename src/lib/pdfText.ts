/**
 * Makes text safe for jsPDF's built-in fonts.
 *
 * Those fonts only know the Windows-1252 character set. Anything else — emoji, Polish
 * "ł", Japanese, Cyrillic — is not skipped or boxed: jsPDF writes the wrong bytes, so
 * the PDF shows garbled letters (and garbles the width calculation that wraps the
 * line). Accents are folded where that gives a real letter ("ą" → "a"); everything
 * else becomes "?", which at least tells the reader something was there.
 *
 * Word documents and CSV/JSON carry full Unicode and do not need this.
 */

const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Zero-width joiners, variation selectors and lone combining marks: drop, do not print "?". */
function isInvisible(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) || // zero-width space, joiners, direction marks
    cp === 0x2060 || // word joiner
    cp === 0xfeff || // byte-order mark
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors (emoji presentation)
    (cp >= 0x0300 && cp <= 0x036f) // lone combining accents
  );
}

export function pdfSafe(text: string | null | undefined): string {
  if (!text) return '';
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 10) out += '\n';
    else if (cp < 32 || cp === 127) out += ' ';
    else if (cp <= 126 || (cp >= 160 && cp <= 255) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else if (isInvisible(cp)) continue;
    else {
      const folded = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      out += /^[ -~]+$/.test(folded) ? folded : '?';
    }
  }
  return out;
}
