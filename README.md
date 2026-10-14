# mi-primer-repo
Mi primer repositorio de prueba con Claude Code

## EVENT HORIZON — An Interactive Galaxy Observatory

A single self-contained `index.html` (three.js r160 from jsDelivr via import map, no build step, no image files) with three connected scenes in one continuous 3D world:

1. **Galaxy view**: a procedural barred spiral with up to 1,000,000 GPU stars (Ultra) or 550,000 (High). It has a bulge, a bar, 2–6 log-spiral arms, HII knots, dust lanes, a halo and 16 globular clusters. Stars follow a flat rotation curve computed in the vertex shader, and the arms are a density wave in the pattern frame, so they never wind up.
2. **Core dive**: zoom in seamlessly to a ray-marched Schwarzschild black hole. It has a true-black shadow (~2.6 rₛ), a photon ring, the lensed far side of the accretion disk with a volumetric corona, Doppler beaming and gravitational redshift, plus optional jets. On the way in you approach the nuclear star cluster, which grows from a point of light until it surrounds you. Around the hole, the background combines a live 360° capture of the galaxy with over half a million analytic stars rendered as true point sources: each image goes through the lens Jacobian, so stars stay crisp and round, brighten with magnification and pile up along the Einstein ring with secondary images inside it.
3. **Collision mode**: a Toomre & Toomre style restricted three-body encounter. A GPU leapfrog integrator (via `GPUComputationRenderer`) moves 65k–262k particles split into stars, bulge, gas and dust. Galaxies start as clumpy, flocculent spirals and develop tidal tails, bridges, ring galaxies and a merger. Tidally shocked gas ignites patchy star-forming knots (pink Hα with young blue stars). An auto-framing camera follows the encounter, and the HUD narrates its phases.

Open `index.html` in a recent desktop browser with WebGL2. Keys: `Space` pause · `T` tour · `G`/`C` modes · `R` reset · `H` hide UI · `F` fullscreen · `?` help.
Add `?tier=ultra|high|medium|low` to the URL to force a quality tier (otherwise it is benchmarked automatically).
