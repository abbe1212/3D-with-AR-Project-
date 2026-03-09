import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
    constructor(container) {
        this.container = container;
        
        // Scene setup
        this.scene = new THREE.Scene();
        // Subtle dark gradient background
        this.scene.background = new THREE.Color(0x131322); // Replaced with renderer clearColor below for transparency support
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            45, 
            container.clientWidth / container.clientHeight, 
            0.1, 
            100
        );
        this.camera.position.set(0, 0.5, 2);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.setClearColor(0x000000, 0); // Transparent background for AR compatibility implicitly
        container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 5;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffeedd, 1.2);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
        
        const fillLight = new THREE.HemisphereLight(0x8888aa, 0x222233, 0.5);
        this.scene.add(fillLight);

        // Grid helper (subtle)
        const gridHelper = new THREE.GridHelper(2, 20, 0xffffff, 0xffffff);
        gridHelper.material.opacity = 0.05;
        gridHelper.material.transparent = true;
        gridHelper.position.y = -0.5; // Bottom of unit-scaled model
        this.scene.add(gridHelper);

        this.currentModel = null;
        
        // Resize handling
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Start render loop
        this.animate();
    }

    loadModel(modelGroup) {
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
        }
        this.currentModel = modelGroup;
        // Position it slightly above the grid
        this.currentModel.position.set(0, 0, 0);
        this.scene.add(this.currentModel);
        this.resetCamera();
    }

    resetCamera() {
        this.camera.position.set(0, 0.5, 2);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    onWindowResize() {
        if (!this.container) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        
        if (this.currentModel) {
            // Optional: slow auto-rotation
            this.currentModel.rotation.y += 0.002;
        }
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        cancelAnimationFrame(this.animationFrameId);
        window.removeEventListener('resize', this.onWindowResize.bind(this));
        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}
