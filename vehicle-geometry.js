// World-space footprint shared by traffic, the starting grid and rendering.
// The garage uses the full-resolution illustration; track cars use this scale.
export const CAR_SCALE=.55;
export const CAR_LENGTH=67*CAR_SCALE;
export const CAR_WIDTH=36*CAR_SCALE;
export const SAFETY_GAP=CAR_LENGTH+7;
export const LANE_CLEARANCE=CAR_LENGTH+20;
export const GRID_SPACING=62;
export const CAMERA_ZOOM={desktop:.72,mobile:.54};
