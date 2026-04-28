import * as THREE from "three";

import { NODE_COLOR_HEX } from "../config/graphConfig";

export function createGlowPointMaterial(color = new THREE.Color(NODE_COLOR_HEX)): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      cameraZoom: { value: 1 },
      glowColor: { value: color },
    },
    vertexShader: `
      attribute float pointSize;
      attribute float pointOpacity;
      varying float vOpacity;
      uniform float cameraZoom;

      void main() {
        vOpacity = pointOpacity;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointSize * cameraZoom;
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      uniform vec3 glowColor;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float distanceFromCenter = length(coord) * 2.0;
        float alpha = 1.0 - smoothstep(0.05, 1.0, distanceFromCenter);
        alpha = pow(alpha, 1.85) * vOpacity;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
  });
}
