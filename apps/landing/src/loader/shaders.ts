// GLSL for the loader: trail accumulation (ping-pong) + frost composite.

export const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Trail pass. R = cleared frost (slow fade, accumulates the drawn stroke),
 * G = cursor head glow (fast fade).
 */
export const trailFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrevTrail;
  uniform vec2  uCursorUV;
  uniform vec2  uPrevCursorUV;
  uniform float uCursorActive;
  uniform float uHeadActive;
  uniform float uCursorRadius;
  uniform float uAspect;
  uniform float uFade;
  uniform float uHeadFade;
  uniform float uReset;
  varying vec2 vUv;

  // distance from p to segment ab (aspect corrected)
  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 prev = texture2D(uPrevTrail, vUv).rg;
    if (uReset > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    float cleared = prev.r * uFade;
    float head    = prev.g * uHeadFade;

    vec2 p = vUv;      p.x *= uAspect;
    vec2 a = uPrevCursorUV; a.x *= uAspect;
    vec2 b = uCursorUV;     b.x *= uAspect;
    float d = segDist(p, a, b);

    float stroke = 1.0 - smoothstep(uCursorRadius * 0.55, uCursorRadius, d);
    float glow   = 1.0 - smoothstep(0.0, uCursorRadius * 1.6, length(p - b));

    cleared = max(cleared, stroke * uCursorActive);
    head    = max(head, glow * uHeadActive);

    gl_FragColor = vec4(cleared, head, 0.0, 1.0);
  }
`;

/**
 * Frost composite. Light palette: white frosted glass over a soft warm
 * gradient. Where the trail cleared the frost the background shows through
 * sharp; elsewhere the background is refracted by the ice normal map and
 * lifted toward white. uLoadProgress freezes the pane from the top as assets
 * load; uMelt clears it radially from uMeltCenter once the R is drawn.
 */
export const frostFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uTrail;
  uniform sampler2D uFrostTex;
  uniform sampler2D uFrostNormal;
  uniform sampler2D uGuide;
  uniform float uHasGuide;
  uniform float uGuideOpacity;
  uniform vec2  uFrostScale;
  uniform vec2  uGuideScale;
  uniform float uAspect;
  uniform float uTime;
  uniform float uLoadProgress;
  uniform float uMelt;
  uniform vec2  uMeltCenter;
  uniform float uWhiteout;
  varying vec2 vUv;

  float rand(vec2 n) {
    vec3 p = fract(vec3(n.xyx) * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  // Soft light background: white -> pale warm grey with a low sun glow.
  vec3 background(vec2 uv) {
    vec2 c = uv - vec2(0.5, 1.15);
    c.x *= uAspect;
    float d = length(c);
    vec3 top = vec3(0.985, 0.985, 0.98);
    vec3 mid = vec3(0.93, 0.93, 0.915);
    vec3 low = vec3(0.86, 0.865, 0.85);
    vec3 col = mix(top, mid, smoothstep(0.35, 1.05, d));
    col = mix(col, low, smoothstep(1.05, 1.6, d));
    // faint warm bloom near the bottom centre
    vec2 g = uv - vec2(0.5, -0.1); g.x *= uAspect;
    col += vec3(0.05, 0.04, 0.02) * (1.0 - smoothstep(0.0, 0.9, length(g)));
    return col;
  }

  void main() {
    vec2 trail = texture2D(uTrail, vUv).rg;
    float cleared = trail.r;
    float head = trail.g;

    vec2 fUv = (vUv - 0.5) * uFrostScale + 0.5;
    float ice = texture2D(uFrostTex, fUv).r;
    vec3 nrm = texture2D(uFrostNormal, fUv).rgb * 2.0 - 1.0;

    // freeze from the top as the loader progresses
    float freezeVal = (1.0 - vUv.y) * 0.6 + ice * 0.4;
    float prog = uLoadProgress * 1.5;
    float frozen = 1.0 - smoothstep(prog - 0.35, prog, freezeVal);

    // radial melt from the drawn R
    vec2 md = vUv - uMeltCenter; md.x *= uAspect;
    float meltEdge = uMelt - 0.2 + (ice - 0.5) * 0.25;
    float melted = 1.0 - smoothstep(meltEdge - 0.08, meltEdge + 0.08, length(md));

    float frost = frozen * (1.0 - clamp(cleared, 0.0, 1.0)) * (1.0 - melted);

    // refracted background where frosted
    vec2 offs = nrm.xy * 0.035 * frost;
    vec3 bgClear = background(vUv);
    vec3 bgIce = background(vUv + offs);
    float grain = (rand(vUv * vec2(1600.0, 900.0) + uTime * 0.01) - 0.5) * 0.035;
    // frosted glass: darker crystal body, bright veins; slightly cool
    vec3 iceCol = bgIce * (0.80 + ice * 0.26) + grain;
    iceCol = mix(iceCol, vec3(0.90, 0.93, 0.97), 0.16);
    iceCol = min(iceCol, vec3(1.0));

    vec3 col = mix(bgClear, iceCol, frost);

    // ghost guide letter, sits *in* the frost (darker, slightly clearer)
    if (uHasGuide > 0.5) {
      vec2 gUv = (vUv - 0.5) * uGuideScale + 0.5;
      float g = texture2D(uGuide, gUv).a;
      col = mix(col, col * 0.90, g * uGuideOpacity * frost);
    }

    // cleared edge: thin darker rim like scraped ice
    float rim = smoothstep(0.02, 0.35, cleared) * (1.0 - smoothstep(0.35, 0.9, cleared));
    col *= 1.0 - rim * 0.10 * frozen * (1.0 - melted);

    // cursor head glow (soft white)
    col = mix(col, vec3(1.0), head * 0.7);

    col = mix(col, vec3(1.0), uWhiteout);
    gl_FragColor = vec4(col, 1.0);
  }
`;
