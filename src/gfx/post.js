// Post-processing stack: AO -> tilt-shift -> bloom + tone map + painterly grade -> SMAA
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, TiltShiftEffect, Effect, BlendFunction, KernelSize, ChromaticAberrationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const GRADE_FRAG = /* glsl */`
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform vec3 uVigColor;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform float uGrain;
uniform float uTime;
uniform float uWipe;
uniform vec3 uWipeColor;
uniform float uDesat;

float gHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, c * uGain, smoothstep(0.25, 0.95, l));
  c += uLift * (1.0 - smoothstep(0.0, 0.55, l));
  c = mix(vec3(l), c, uSat * (1.0 - uDesat));
  c = (c - 0.5) * uContrast + 0.5;
  vec2 d = (uv - 0.5) * vec2(1.25, 1.0);
  float v = smoothstep(0.95, 0.25, length(d) * uVignette);
  c = mix(uVigColor * c, c, v);
  float n = gHash(floor(uv * resolution) + fract(uTime) * 100.0);
  c += (n - 0.5) * uGrain;
  c = mix(c, uFlashColor, uFlash);
  // iris wipe for scene transitions (0 = open, 1 = closed)
  if (uWipe > 0.0) {
    vec2 q = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
    float r = (1.0 - uWipe) * 1.2;
    float m = smoothstep(r, r - 0.02, length(q));
    // paw-shaped ring edge sparkle
    c = mix(uWipeColor, c, m);
  }
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uSat', new THREE.Uniform(1.12)], ['uContrast', new THREE.Uniform(1.04)],
        ['uLift', new THREE.Uniform(new THREE.Vector3(0.02, 0.0, 0.05))],
        ['uGain', new THREE.Uniform(new THREE.Vector3(1.03, 1.0, 0.95))],
        ['uVignette', new THREE.Uniform(1.0)], ['uVigColor', new THREE.Uniform(new THREE.Vector3(0.55, 0.45, 0.65))],
        ['uFlashColor', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uFlash', new THREE.Uniform(0)],
        ['uGrain', new THREE.Uniform(0.018)], ['uTime', new THREE.Uniform(0)],
        ['uWipe', new THREE.Uniform(0)], ['uWipeColor', new THREE.Uniform(new THREE.Vector3(0.16, 0.1, 0.2))],
        ['uDesat', new THREE.Uniform(0)],
      ]),
    });
  }
  set(name, v) { const u = this.uniforms.get(name); if (u.value?.set && typeof v === 'object') u.value.copy(v); else u.value = v; }
}

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, stencilBuffer: true });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    const w = innerWidth, h = innerHeight;
    this.ao = new N8AOPostPass(scene, camera, w, h);
    Object.assign(this.ao.configuration, { aoRadius: 1.6, distanceFalloff: 0.6, intensity: 2.2, color: new THREE.Color('#40285a'), halfRes: quality < 2, aoSamples: 12, denoiseSamples: 8, denoiseRadius: 10, gammaCorrection: false });
    this.composer.addPass(this.ao);
    this.tilt = new TiltShiftEffect({ offset: 0.0, rotation: 0, focusArea: 0.62, feather: 0.3, kernelSize: KernelSize.SMALL });
    this.tiltPass = new EffectPass(camera, this.tilt);
    this.composer.addPass(this.tiltPass);
    this.bloom = new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.78, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72, levels: 7 });
    const tmq = new URLSearchParams(location.search).get('tm') || 'neutral';
    this.tone = new ToneMappingEffect({ mode: { agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC, neutral: ToneMappingMode.NEUTRAL, linear: ToneMappingMode.LINEAR, reinhard: ToneMappingMode.REINHARD2, uc2: ToneMappingMode.UNCHARTED2, cineon: ToneMappingMode.CINEON }[tmq] });
    this.grade = new GradeEffect();
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 });
    this.mainPass = new EffectPass(camera, this.bloom, this.tone, this.grade);
    this.composer.addPass(this.mainPass);
    this.chromaPass = new EffectPass(camera, this.chroma);
    this.composer.addPass(this.chromaPass);
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.smaaPass = new EffectPass(camera, this.smaa);
    this.composer.addPass(this.smaaPass);
    this.flash = 0; this.aberr = 0;
    const P = new URLSearchParams(location.search);
    const off = (P.get('off') || '').split(',');
    if (off.includes('ao')) this.ao.enabled = false;
    if (off.includes('tilt')) this.tiltPass.enabled = false;
    if (off.includes('main')) this.mainPass.enabled = false;
    if (off.includes('smaa')) this.smaaPass.enabled = false;
    this.raw = P.has('raw');
    this.scene = scene; this.camera = camera;
  }
  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.renderPass.mainScene = scene; this.renderPass.mainCamera = camera;
    this.ao.scene = scene; this.ao.camera = camera;
    for (const p of [this.tiltPass, this.mainPass, this.chromaPass, this.smaaPass]) p.mainCamera = camera;
  }
  setSize(w, h) { this.composer.setSize(w, h); this.ao.setSize?.(w, h); }
  pulse(color = '#ffffff', amt = 0.35) { this.grade.uniforms.get('uFlashColor').value.set(...new THREE.Color(color).toArray()); this.flash = Math.max(this.flash, amt); }
  hitAberration(a = 1) { this.aberr = Math.max(this.aberr, a); }
  render(dt, time) {
    if (this.raw) { this.renderer.render(this.scene, this.camera); return; }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.aberr = Math.max(0, this.aberr - dt * 3);
    this.grade.uniforms.get('uFlash').value = this.flash;
    this.grade.uniforms.get('uTime').value = time;
    this.chroma.offset.set(0.0022 * this.aberr, 0.0012 * this.aberr);
    this.chromaPass.enabled = this.aberr > 0.01;
    this.composer.render(dt);
  }
}
