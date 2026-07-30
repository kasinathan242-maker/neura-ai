import { createXRStore } from '@react-three/xr';

/**
 * The shared WebXR session store.
 *
 * Kept in its own module so the components that render a scene stay
 * component-only (which is what React Fast Refresh needs to work), while pages
 * can still call `xrStore.enterAR()` from a button handler.
 *
 * `emulate: false` matters more than it looks: by default @react-three/xr
 * injects the IWER WebXR emulator on localhost, which dynamically pulls
 * `@iwer/sem` -- around 6MB of synthetic room captures. Real AR/VR here goes
 * through the browser's native WebXR, so the emulator is pure weight.
 */
export const xrStore = createXRStore({ emulate: false });

export default xrStore;
