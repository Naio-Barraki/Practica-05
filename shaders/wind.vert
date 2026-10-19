uniform float uTime;
uniform float uWindStrength;
uniform float uPhase;
varying vec2 vUv;
varying float vWind;

void main() {
    vUv = uv;
    vec3 transformed = position;
    float edgeWeight = clamp(abs(position.x) * 1.25 + abs(position.z), 0.0, 1.0);
    float wave = sin(uTime * 1.75 + position.y * 2.2 + uPhase);
    transformed.x += wave * uWindStrength * 0.085 * edgeWeight;
    transformed.z += cos(uTime * 1.25 + position.x * 2.0 + uPhase) * uWindStrength * 0.045 * edgeWeight;
    vWind = abs(wave) * edgeWeight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
