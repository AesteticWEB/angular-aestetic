import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild
} from '@angular/core';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('webglCanvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private frameId?: number;
  private pointer = new THREE.Vector2(0, 0);
  private pointerTarget = new THREE.Vector2(0, 0);
  private floating?: THREE.Group;
  private sectionFloat?: THREE.Group;
  private sectionMeshes: THREE.Mesh[] = [];
  private particles?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private backdrop?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private lightBars: THREE.Mesh[] = [];
  private scroll = 0;
  private scrollTarget = 0;
  private running = true;
  private lastPointerEvent?: number;
  private typingTimers: number[] = [];
  private scrollRaf?: number;
  private lastScrollValue = -1;
  private lastFrameTime = 0;
  private readonly targetFrameMs = 1000 / 45;
  private lenis?: Lenis;
  private lenisRaf?: number;
  private activeTiltEl?: HTMLElement;
  private activeMagneticEl?: HTMLElement;

  ngAfterViewInit(): void {
    gsap.registerPlugin(ScrollTrigger);
    this.setupReveal();
    this.setupSmoothScroll();
    this.setupScrollEffects();
    this.setupThree();
    this.updateScroll();
    this.setupHeroTyping();
    this.setupMagneticTilt();
  }

  ngOnDestroy(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
    if (this.lenisRaf) {
      cancelAnimationFrame(this.lenisRaf);
    }
    this.typingTimers.forEach((timer) => window.clearTimeout(timer));
    this.lenis?.destroy();
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    this.renderer?.dispose();
    this.particles?.geometry.dispose();
    this.particles?.material.dispose();
    this.sectionMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      mat.dispose();
    });
    if (this.backdrop) {
      this.backdrop.geometry.dispose();
      this.backdrop.material.dispose();
    }
    this.lightBars.forEach((mesh) => {
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material;
      mat.dispose();
    });
    this.scene = undefined;
    this.camera = undefined;
  }

  private setupReveal(): void {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!items.length) {
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            target.classList.add('is-visible');
          } else {
            target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '120px 0px -5% 0px' }
    );

    items.forEach((el, index) => {
      const dataDelay = el.dataset['revealDelay'];
      const delay = dataDelay ? Number(dataDelay) : index * 12;
      el.style.setProperty('--reveal-delay', `${delay}ms`);
      observer.observe(el);
    });
  }

  private setupSmoothScroll(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    this.lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      lerp: 0.1
    });
    this.lenis.on('scroll', ScrollTrigger.update);
    this.lenis.on('scroll', (event) => {
      this.scrollTarget = event.progress;
      const doc = document.documentElement;
      const next = Number(this.scrollTarget.toFixed(4));
      if (next !== this.lastScrollValue) {
        this.lastScrollValue = next;
        doc.style.setProperty('--scroll-progress', next.toString());
      }
    });
    const raf = (time: number) => {
      this.lenis?.raf(time);
      this.lenisRaf = requestAnimationFrame(raf);
    };
    this.lenisRaf = requestAnimationFrame(raf);
    ScrollTrigger.refresh();
  }

  private setupScrollEffects(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    gsap.to('.hero-bg', {
      y: 60,
      scrollTrigger: {
        trigger: '#hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6
      }
    });

    gsap.to('.hero-projects', {
      y: -40,
      scrollTrigger: {
        trigger: '#hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6
      }
    });

    gsap.to('.about-cards', {
      y: -24,
      scrollTrigger: {
        trigger: '#about',
        start: 'top 75%',
        end: 'bottom top',
        scrub: 0.6
      }
    });
  }

  private setupThree(): void {
    if (!this.canvasRef) {
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || window.innerWidth < 900) {
      return;
    }
    const canvas = this.canvasRef.nativeElement;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 14);

    const ambient = new THREE.AmbientLight(0xb39bff, 0.35);
    scene.add(ambient);
    const key = new THREE.PointLight(0x7b3bff, 1.2, 80);
    key.position.set(6, 6, 12);
    scene.add(key);
    const rim = new THREE.PointLight(0x5ad6ff, 1, 80);
    rim.position.set(-6, -4, 8);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    const sectionGroup = new THREE.Group();
    scene.add(sectionGroup);

    const backdropGeo = new THREE.PlaneGeometry(44, 26, 1, 1);
    const backdropMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uScroll;
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          vec2 uv = vUv;
          float wave = sin((uv.y + uScroll) * 8.0 + uTime * 0.4) * 0.08;
          float glow = smoothstep(0.0, 0.6, 1.0 - abs(uv.y - 0.5));
          float grain = noise(uv * 120.0 + uTime * 0.02) * 0.12;
          vec3 colA = vec3(0.12, 0.08, 0.22);
          vec3 colB = vec3(0.02, 0.04, 0.10);
          vec3 colC = vec3(0.35, 0.16, 0.55);
          vec3 color = mix(colB, colA, uv.y + wave);
          color = mix(color, colC, glow * 0.25);
          color += grain;
          gl_FragColor = vec4(color, 0.35);
        }
      `
    });
    const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
    backdrop.position.set(0, 0, -18);
    scene.add(backdrop);

    const geometry = new THREE.IcosahedronGeometry(1.6, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x24163a,
      metalness: 0.3,
      roughness: 0.2,
      emissive: 0x3a1f6b,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9
    });

    const meshA = new THREE.Mesh(geometry, material);
    meshA.position.set(-4.2, 1.4, -2);
    group.add(meshA);

    const meshB = new THREE.Mesh(geometry, material.clone());
    meshB.scale.set(1.3, 1.3, 1.3);
    meshB.position.set(3.8, -1.8, -1);
    group.add(meshB);

    const meshC = new THREE.Mesh(geometry, material.clone());
    meshC.scale.set(0.9, 0.9, 0.9);
    meshC.position.set(0.5, 3.6, -3.5);
    group.add(meshC);

    // ring/knot removed per request

    // light bars removed per request

    const particleCount = 180;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 30;
      positions[i3 + 1] = (Math.random() - 0.5) * 18;
      positions[i3 + 2] = (Math.random() - 0.5) * 20;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({
      size: 0.06,
      color: 0xb9f0ff,
      opacity: 0.65,
      transparent: true,
      depthWrite: false
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.floating = group;
    this.sectionFloat = sectionGroup;
    this.sectionMeshes = [];
    this.particles = particles;
    this.backdrop = backdrop;
    this.lightBars = [];

    const animate = (now: number) => {
      if (!this.renderer || !this.scene || !this.camera) {
        return;
      }
      if (!this.running) {
        this.frameId = requestAnimationFrame(animate);
        return;
      }
      if (now - this.lastFrameTime < this.targetFrameMs) {
        this.frameId = requestAnimationFrame(animate);
        return;
      }
      this.lastFrameTime = now;
      this.pointer.lerp(this.pointerTarget, 0.08);
      this.scroll += (this.scrollTarget - this.scroll) * 0.06;
      camera.position.x = this.pointer.x * 2.2;
      camera.position.y = this.pointer.y * 1.6;
      camera.lookAt(0, 0, 0);

      const time = now * 0.001;
      if (this.backdrop) {
        this.backdrop.material.uniforms['uTime'].value = time;
        this.backdrop.material.uniforms['uScroll'].value = this.scroll;
      }
      group.rotation.y = time * 0.2;
      group.rotation.x = time * 0.08;
      meshA.rotation.set(time * 0.5, time * 0.3, 0);
      meshB.rotation.set(time * 0.35, time * 0.45, 0);
      meshC.rotation.set(time * 0.4, time * 0.25, 0);
      particles.rotation.y = time * 0.05;

      sectionGroup.position.y = 8 - this.scroll * 6;
      sectionGroup.rotation.y = this.scroll * 0.8;
      // light bars removed
      const fade = Math.max(0, Math.min(1, 1 - (this.scroll - 0.35) / 0.25));
      this.sectionMeshes.forEach((mesh, index) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.45 + Math.sin(time + index) * 0.12 + this.scroll * 0.35;
        const baseOpacity = typeof mesh.userData['baseOpacity'] === 'number' ? mesh.userData['baseOpacity'] : 0.8;
        mat.opacity = baseOpacity * fade;
      });

      renderer.render(scene, camera);
      this.frameId = requestAnimationFrame(animate);
    };

    this.frameId = requestAnimationFrame(animate);
  }

  private setupHeroTyping(): void {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('.typewriter[data-text]')
    );
    if (!nodes.length) {
      return;
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      nodes.forEach((node) => {
        node.textContent = node.dataset['text'] ?? '';
        node.classList.remove('is-typing');
      });
      return;
    }

    const startTyping = () => {
      nodes.forEach((node) => {
        node.textContent = '';
        node.classList.add('is-typing');
      });

      const speed = 32;
      const pause = 180;
      let delay = 120;
      nodes.forEach((node) => {
        const text = node.dataset['text'] ?? '';
        const start = window.setTimeout(() => {
          this.typeText(node, text, speed);
        }, delay);
        this.typingTimers.push(start);
        delay += text.length * speed + pause;
      });
    };

    const hero = document.querySelector<HTMLElement>('.hero');
    if (!hero) {
      startTyping();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          startTyping();
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(hero);
  }

  private typeText(node: HTMLElement, text: string, speed: number): void {
    let i = 0;
    const tick = () => {
      node.textContent = text.slice(0, i);
      i += 1;
      if (i <= text.length) {
        this.typingTimers.push(window.setTimeout(tick, speed));
      } else {
        node.classList.remove('is-typing');
      }
    };
    tick();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    const now = performance.now();
    if (this.lastPointerEvent && now - this.lastPointerEvent < 24) {
      return;
    }
    this.lastPointerEvent = now;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.pointerTarget.set(x, y);
    const root = document.documentElement;
    root.style.setProperty('--pointer-x', `${event.clientX}px`);
    root.style.setProperty('--pointer-y', `${event.clientY}px`);
    root.style.setProperty('--hero-parallax-x', `${x * 16}`);
    root.style.setProperty('--hero-parallax-y', `${y * 10}`);

    if (this.activeTiltEl || this.activeMagneticEl) {
      const el = this.activeTiltEl ?? this.activeMagneticEl;
      if (el) {
        const rect = el.getBoundingClientRect();
        const relX = (event.clientX - rect.left) / rect.width;
        const relY = (event.clientY - rect.top) / rect.height;
        const nx = relX - 0.5;
        const ny = relY - 0.5;
        if (this.activeTiltEl) {
          this.activeTiltEl.style.setProperty('--tilt-x', `${(-ny * 8).toFixed(2)}deg`);
          this.activeTiltEl.style.setProperty('--tilt-y', `${(nx * 10).toFixed(2)}deg`);
          this.activeTiltEl.style.setProperty('--glow-x', `${(relX * 100).toFixed(2)}%`);
          this.activeTiltEl.style.setProperty('--glow-y', `${(relY * 100).toFixed(2)}%`);
        }
        if (this.activeMagneticEl) {
          this.activeMagneticEl.style.setProperty('--magnetic-x', `${(nx * 10).toFixed(2)}px`);
          this.activeMagneticEl.style.setProperty('--magnetic-y', `${(ny * 10).toFixed(2)}px`);
        }
      }
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.lenis) {
      return;
    }
    if (this.scrollRaf) {
      return;
    }
    this.scrollRaf = window.requestAnimationFrame(() => {
      this.scrollRaf = undefined;
      this.updateScroll();
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.renderer || !this.camera) {
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateScroll();
  }

  private updateScroll(): void {
    const doc = document.documentElement;
    const max = Math.max(doc.scrollHeight - window.innerHeight, 1);
    this.scrollTarget = Math.min(Math.max(window.scrollY / max, 0), 1);
    const next = Number(this.scrollTarget.toFixed(4));
    if (next !== this.lastScrollValue) {
      this.lastScrollValue = next;
      doc.style.setProperty('--scroll-progress', next.toString());
    }
  }

  private setupMagneticTilt(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const tiltEls = Array.from(document.querySelectorAll<HTMLElement>('[data-tilt]'));
    const magneticEls = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));

    const resetEffects = (el: HTMLElement) => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
      el.style.setProperty('--magnetic-x', '0px');
      el.style.setProperty('--magnetic-y', '0px');
      el.style.setProperty('--glow-x', '50%');
      el.style.setProperty('--glow-y', '50%');
    };

    tiltEls.forEach((el) => {
      resetEffects(el);
      el.addEventListener('mouseenter', () => {
        this.activeTiltEl = el;
      });
      el.addEventListener('mouseleave', () => {
        resetEffects(el);
        if (this.activeTiltEl === el) {
          this.activeTiltEl = undefined;
        }
      });
    });

    magneticEls.forEach((el) => {
      resetEffects(el);
      el.addEventListener('mouseenter', () => {
        this.activeMagneticEl = el;
      });
      el.addEventListener('mouseleave', () => {
        resetEffects(el);
        if (this.activeMagneticEl === el) {
          this.activeMagneticEl = undefined;
        }
      });
    });
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    this.running = !document.hidden;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    if (target.closest('a, button, input, textarea, select')) {
      return;
    }
    const cta = target.closest<HTMLElement>('[data-cta="telegram"]');
    if (cta) {
      window.open('https://t.me/AesteticDesigner', '_blank', 'noopener');
    }
  }
}
