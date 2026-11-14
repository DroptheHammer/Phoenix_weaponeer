/**
 * Can this machine draw the 3D playback? three.js needs WebGL 2 (it dropped
 * WebGL 1), and some webviews (older macOS, Linux without GPU drivers) do not
 * offer it. Asking first lets the overlay explain instead of showing a black
 * box, and spares downloading the 3D code for nothing.
 */
export type WebGLSupport = { ok: true; software: boolean } | { ok: false; reason: string };

// The answer cannot change while the app runs, and each probe costs a context.
let cached: WebGLSupport | undefined;

export function probeWebGL2(): WebGLSupport {
  if (cached) return cached;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const gl = canvas.getContext('webgl2');
    if (!gl) return (cached = { ok: false, reason: '3D playback needs WebGL 2, which this system does not offer.' });
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    // Give the probe's context back now. Browsers allow only about 16 at once,
    // and the 3D view is about to ask for its own.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (maxTexture < 2048) return (cached = { ok: false, reason: 'The graphics driver is too limited for 3D playback.' });
    // A software renderer works, slowly: warn, don't block.
    return (cached = { ok: true, software: /swiftshader|llvmpipe|software/i.test(renderer) });
  } catch (e) {
    return (cached = { ok: false, reason: e instanceof Error ? e.message : String(e) });
  }
}
