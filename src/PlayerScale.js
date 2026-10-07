// Shared physical scale for the production model, gameplay collider, and camera.
// The GLB's measured bind height is 1.70 units and its authored visual scale is .7.
export const PLAYER_WORLD_SCALE = 1;
export const PLAYER_MODEL_SCALE = 0.7;
export const PLAYER_SOURCE_HEIGHT = 1.7;
export const PLAYER_VISUAL_HEIGHT = PLAYER_SOURCE_HEIGHT * PLAYER_MODEL_SCALE * PLAYER_WORLD_SCALE;
export const PLAYER_COLLIDER_HEIGHT = 1.2;
export const PLAYER_COLLIDER_RADIUS = 0.28;
