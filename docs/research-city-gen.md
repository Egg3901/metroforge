# Research: procedural city layout (2026-07)

Question: what is the best-known method for generating realistic street layouts, compatible with MetroForge's deterministic, dependency-free core?

## Survey result

| Family | Examples | Verdict for us |
|---|---|---|
| Grammar / L-system | Parish & Müller 2001 (CityEngine) | Good arterial "global goals / local constraints" ideas (bridge lookahead, snap-to-intersection); network coherence inferior to tensor fields. |
| **Tensor-field-guided** | **Chen, Esch, Wonka, Müller 2008 "Interactive Procedural Street Modeling"** | **Chosen.** Deterministic, controllable, produces the perpendicular-intersection fabric of real cities. Major/minor eigenvector tracing yields grids, radials AND ring roads from one field. |
| Agent/simulation growth | Citygen, Vanegas et al. | Realistic organic growth but slow and hard to keep deterministic across ports. |
| Data-driven / deep learning | UrbanWorld 2024, CityGenAgent 2025, RoBus, GAN road nets | Highest visual fidelity, but non-deterministic, heavyweight, unportable to a native rewrite. Rejected. |
| Parcels | Vanegas et al. "Procedural Generation of Parcels" (OBB recursive split); 2024 hierarchical street+parcel co-generation | Phase 2: replace offset building strips with true block extraction + OBB parcel split. |

## Implemented design (core/city/tensor.ts + streamlines.ts)

1. **Tensor field** T(p) encoded as angle doubling (cos 2θ, sin 2θ) so opposite directions merge:
   - grid basis fields at 6–10 district seeds, orientation from smoothed noise, Gaussian falloff;
   - one radial basis at the CBD (streets toward center; minor eigenvector = rings);
   - boundary fields along water: shoreline tangents with exponential falloff — streets run parallel to coast/river;
   - low-weight noise rotation to break up perfect regularity.
2. **Evenly-spaced streamline tracing** (Jobard–Lefer seeding + Chen hyperstreamlines):
   - arterials: separation ~420 m, traced along BOTH eigen-directions, bridge lookahead over short water spans;
   - locals: separation 100–170 m modulated by population density, only through populated land, terminate near existing streets of the same class (snap-join);
   - eigenvector sign continuity by dot product with previous step; RK-free fixed 40 m Euler steps (determinism-friendly).
3. **Population before streets** (was: after): CBD kernel + 3–5 employment subcenters + coastal premium + noise; street density then follows population, and arterial adjacency feeds back a mild density boost. This matches the empirical structure (networks densify where people are, not vice versa on short timescales).

## Sources

- Chen, Esch, Wonka, Müller, Zhang — Interactive Procedural Street Modeling, SIGGRAPH 2008: https://dl.acm.org/doi/10.1145/1360612.1360702 · project page https://www.sci.utah.edu/~chengu/street_sig08/street_project.htm
- phiresky, Procedural Cities survey (practical algorithm notes): https://github.com/phiresky/procedural-cities/blob/master/paper.md
- Hierarchical co-generation of parcels and streets (2024): https://www.researchgate.net/publication/380157077
- Procedural generation as digital city representation survey (2026): https://link.springer.com/article/10.1007/s43762-026-00263-8
- Parish & Müller 2001 global-goals/local-constraints pattern (bridges, snapping): summarized in the phiresky survey.
