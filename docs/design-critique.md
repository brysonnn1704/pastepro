# Design Critique & Evaluation Scoresheet

Following the OpenDesign five-dimension evaluation framework for Clipper's interface across iPhone (390×844) and PC (1440×900) views in both Light and Dark themes.

## Dimensions & Criteria

1. **Hierarchy (Score: 5/5)**
   - Clear focal points: The QR code / pairing prompt stands out immediately on desktop; the transfer list is arranged cleanly with distinct visual priority for the "Copy" action.
   - On iPhone, the paste/editor space dominates the viewport with one-handed reachable actions (Paste, Send, Clear) at the bottom.
   - No competing equal-weight CTAs.

2. **Typography (Score: 5/5)**
   - Exclusively system font stacks (`-apple-system`, `Segoe UI`, monospace). Zero third-party web font trackers or CDNs.
   - Tabular numerals (`tabular-nums`) used on all counters and timer countdowns preventing layout jitter.
   - Distinct monospaced treatment for code snippets, pairing codes, and hex transfer tokens.

3. **Colour & Contrast (Score: 5/5)**
   - Exact mathematical evaluation using `scripts/check-contrast.mjs`.
   - Verified WCAG AA contrast on every pairing:
     - Primary text on surface: 18.88:1 (Light), 18.97:1 (Dark)
     - Secondary labels: 7.81:1 (Light), 7.85:1 (Dark)
     - Accent (#0057E7 / #4D8EFF): 5.97:1 (Light), 6.25:1 (Dark)
     - Success state token adjusted to #15803D (5.02:1) meeting full AA requirements.
   - Single restrained accent colour. Zero rainbow or purple-to-blue gradient blobs.

4. **Spacing & Layout (Score: 4.8/5)**
   - Strict 4/8-point rhythm (`--space-1` through `--space-16`).
   - Clean alignment: desktop is left-aligned two-column without centered-everything syndrome; mobile has safe-area inset preservation.
   - Minimum 44×44px touch targets on mobile controls for comfortable thumb reach.

5. **Craft & Polish (Score: 5/5)**
   - Thoughtful microcopy: calm, honest about platform limits (explaining manual paste gesture on iOS and Ctrl+V usage on Windows).
   - Public PC security card with concrete guidance on clearing Windows clipboard history (`Win+V`).
   - Fallback manual textarea copy mechanism when `navigator.clipboard` access is restricted.
   - All interactive elements possess explicit `:focus-visible` rings with offset.
   - Respects `prefers-reduced-motion: reduce`.

### Overall Score: 4.96 / 5.0 (All dimensions ≥ 4.8)
