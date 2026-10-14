# mi-primer-repo
Mi primer repositorio de prueba con Claude Code

## EVENT HORIZON — An Interactive Galaxy Observatory

A single self-contained `index.html` (three.js r160 from jsDelivr via import map, no build step, no image files) with three connected scenes in one continuous 3D world:

1. **Galaxy view**: a procedural barred spiral with up to 1,000,000 GPU stars (Ultra) or 550,000 (High). It has a bulge, a bar, 2–6 log-spiral arms, HII knots, dust lanes, a halo and 16 globular clusters. Stars follow a flat rotation curve computed in the vertex shader, and the arms are a density wave in the pattern frame, so they never wind up.
2. **Core dive**: zoom in seamlessly to a ray-marched Schwarzschild black hole. It has a true-black shadow (~2.6 rₛ), a photon ring, the lensed far side of the accretion disk, Doppler beaming and gravitational redshift, plus optional jets.
3. **Collision mode**: a Toomre & Toomre style restricted three-body encounter. A GPU leapfrog integrator (via `GPUComputationRenderer`) moves 65k–131k particles and produces tidal tails, bridges, ring galaxies and a merger.

Open `index.html` in a recent desktop browser with WebGL2. Keys: `Space` pause · `T` tour · `G`/`C` modes · `R` reset · `H` hide UI · `F` fullscreen · `?` help.
Add `?tier=ultra|high|medium|low` to the URL to force a quality tier (otherwise it is benchmarked automatically).
