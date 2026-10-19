uniform vec3 uLeafColor;
varying vec2 vUv;
varying float vWind;

void main() {
    float heightTint = smoothstep(0.0, 1.0, vUv.y);
    vec3 darkGreen = uLeafColor * 0.68;
    vec3 lightGreen = mix(uLeafColor, vec3(0.72, 0.88, 0.49), 0.18);
    vec3 color = mix(darkGreen, lightGreen, heightTint);
    color = mix(color, color * 0.96 + vec3(0.035, 0.055, 0.02), clamp(vWind * 0.35, 0.0, 0.25));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
