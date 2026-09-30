# Asset brief: <task-name>
<!-- Claude fills this in. Be concrete: measurements, hex colours, shapes, and what "done" looks like. Delete the hints. -->

## What it is and where it lives
<!-- One paragraph: the object, which region / scene it appears in, how often (a one-off landmark vs a prop repeated
     40×), what the player does near it. -->

## Look
- **Silhouette and proportions**: <!-- the big shapes first, with sizes in m: "a squat 1.2 m tall stone lantern: a
  wide 0.9 m umbrella roof over a 0.35 m firebox on three splayed legs" -->
- **Details**: <!-- secondary shapes and accents, and what matters from the 45° top-down camera -->
- **Materials / colour** (hex): <!-- stone #8e94a6 / #a0a6b8, snow #f6f9ff with shadow #c4d2ee, glow #ffd890 … -->
- **Mood / references**: <!-- reference images attached with --image (game screenshots of the surroundings, concept
  sketches); name what to take from each -->

## Technical
- **Size**: <!-- overall W × D × H in m -->
- **Triangle budget**: <!-- e.g. ≤ 4k -->
- **Textures**: <!-- vertex colour only / one ≤ 512² atlas / … -->
- **Separate named parts** the game needs: <!-- e.g. `lantern_glow` (emissive), `door` (hinged: pivot at its left
  edge), or "none: one joined mesh" -->
- **Variants**: <!-- e.g. 3 seeds with different wear / snow amounts → NAME_a.glb, NAME_b.glb … or none -->
- **Output**: `public/models/<task-name>.glb`

## Done when
<!-- 3–6 checkable acceptance criteria, e.g.:
- reads as a snowy yukimi lantern at the game camera (preview/game.png) without explanation
- warm glow visible through the paper windows; snow sits on the roof and feet
- ≤ 4k triangles, stands on the ground, faces −Y
-->
