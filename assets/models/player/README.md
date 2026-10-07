# Player Rat-Knight GLB

Place the production model at `public/assets/models/player/rat-knight.glb`. The runtime loads glTF 2.0 binary assets with Three.js `GLTFLoader`; keep the procedural fallback intact so the game remains playable when this file or an optional clip is missing.

Recommended semantic clips (none are mandatory):

- `Idle_AllFours`, `Run_AllFours`
- `Idle_Combat`, `Combat_Walk`, `Aura_Walk`
- `Attack_1`, `Attack_2`, `Attack_3`, `Dodge`
- `Jump`, `Fall`, `Land`
- `Climb_Idle`, `Climb_Up`, `Climb_Side`, `Climb_Jump`
- `Damage`, `Death`, `Kneel`, `Sit_Throne`

Recommended attachment nodes: `WeaponSocket` or `hand.R` / `RightHand`, and `CrownSocket` or `Head`. Clip aliases and fallback states are centralized in `src/PlayerAnimationController.js`; socket and scale offsets are in `src/PlayerVisual.js`.

Export with a neutral forward direction matching the procedural rat (forward is local `-Z`), a grounded origin, and no required root-motion translation. The gameplay controller remains authoritative for movement.
