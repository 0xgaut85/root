import { useEffect, useRef } from 'react';

/**
 * The landing page's "idle bandwidth" backdrop: a very grainy black → red
 * gradient, black dominating, with slow large-scale drift and animated film
 * grain. Same shader as apps/landing Beams.ts, ported to raw WebGL.
 */
const VERT = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `
precision highp float; varying vec2 vUv; uniform float uTime; uniform vec2 uRes;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash21(i), b = hash21(i+vec2(1.,0.)), c = hash21(i+vec2(0.,1.)), d = hash21(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){ float v = 0.; float a = .5; for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
void main(){
  vec2 uv = vUv;
  float n = fbm(uv*2.2 + vec2(0.0, -uTime*0.02));
  // red lives low and to the centre; the top three quarters are black
  float glow = smoothstep(0.75, -0.15, uv.y + (n - 0.5)*0.35);
  glow *= 0.55 + 0.45 * smoothstep(1.0, 0.1, abs(uv.x - 0.5) * 1.6);
  glow = pow(glow, 1.45);
  vec3 red = vec3(0.62, 0.035, 0.05);
  vec3 c = mix(vec3(0.012, 0.004, 0.006), red, glow);
  // heavy film grain: fine + coarse, animated per frame
  vec2 px = uv * uRes;
  float g1 = hash13(vec3(px, floor(uTime*24.0))) - 0.5;
  float g2 = hash13(vec3(floor(px/2.0), floor(uTime*24.0)+7.0)) - 0.5;
  float grain = g1*0.7 + g2*0.5;
  float lum = c.r;
  c += grain * (0.10 + 0.22 * smoothstep(0.0, 0.5, lum)) * vec3(1.0, 0.7, 0.7);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

export function Grain({ className = 'heat' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) {
      // No WebGL: fall back to a static CSS gradient in the same palette.
      c.style.background = 'radial-gradient(120% 70% at 50% 110%, #9e0a0d 0%, #3a0406 35%, #030102 75%)';
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uRes = gl.getUniformLocation(prog, 'uRes');

    let w = 0;
    let h = 0;
    const resize = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = c.width = Math.max(1, Math.floor(r.width * dpr));
      h = c.height = Math.max(1, Math.floor(r.height * dpr));
      gl.viewport(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      if (document.visibilityState === 'visible') {
        gl.uniform1f(uTime, (performance.now() - t0) / 1000);
        gl.uniform2f(uRes, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);
  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden />;
}
