import { cn } from '@/lib/utils';
import { useDarkMode } from '../../context/DarkModeContext';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'>;

export function DottedSurface({ className, ...props }: DottedSurfaceProps) {
  const { dark } = useDarkMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    particles: THREE.Points[];
    animationId: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const SEPARATION = 150;
    const AMOUNTX = 40;
    const AMOUNTY = 60;

    const w = el.offsetWidth;
    const h = el.offsetHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, w / h, 1, 10000);
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    el.appendChild(renderer.domElement);

    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions.push(
          ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
          0,
          iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
        );
        if (dark) {
          colors.push(0.55, 0.55, 0.60);
        } else {
          colors.push(0.15, 0.15, 0.18);
        }
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 6,
      vertexColors: true,
      transparent: true,
      opacity: dark ? 0.55 : 0.45,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let count = 0;

    let running = true;

    const animate = () => {
      if (!running) return;
      const id = requestAnimationFrame(animate);
      if (sceneRef.current) sceneRef.current.animationId = id;

      const posAttr = geometry.attributes.position;
      const pos = posAttr.array as Float32Array;

      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          pos[i * 3 + 1] =
            Math.sin((ix + count) * 0.3) * 50 +
            Math.sin((iy + count) * 0.5) * 50;
          i++;
        }
      }

      posAttr.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.1;
    };

    // Pause loop when tab is hidden, resume when visible — zero GPU cost in background
    const handleVisibility = () => {
      if (document.hidden) {
        running = false;
        if (sceneRef.current) cancelAnimationFrame(sceneRef.current.animationId);
      } else {
        running = true;
        animate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Use ResizeObserver so sizing tracks the container, not the window
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    ro.observe(el);

    const firstId = requestAnimationFrame(animate);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      particles: [points],
      animationId: firstId,
    };

    return () => {
      running = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      ro.disconnect();
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.scene.traverse(obj => {
          if (obj instanceof THREE.Points) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else {
              (obj.material as THREE.Material).dispose();
            }
          }
        });
        sceneRef.current.renderer.dispose();
        if (el && sceneRef.current.renderer.domElement.parentNode === el) {
          el.removeChild(sceneRef.current.renderer.domElement);
        }
      }
      sceneRef.current = null;
    };
  }, [dark]);

  return (
    <div
      ref={containerRef}
      className={cn('pointer-events-none absolute inset-0 -z-10', className)}
      {...props}
    />
  );
}
