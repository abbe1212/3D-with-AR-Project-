import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';

/**
 * Handles Markerless Surface-Tracking AR rendering using WebXR
 */
export class ARViewer {
    constructor() {
        this.scene = new THREE.Scene();

        // ARCamera
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // lowered ambient for better shadows
        this.scene.add(ambientLight);
        this.ambientLight = ambientLight;
        
        // Hemisphere light for soft ambient fill from below
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        this.scene.add(hemisphereLight);
        this.hemisphereLight = hemisphereLight;
        
        const directionalLight = new THREE.DirectionalLight(0xffeedd, 1.0);
        // Position it slightly at an angle to cast better shadows
        directionalLight.position.set(2, 5, 2);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 20;
        directionalLight.shadow.camera.left = -5;
        directionalLight.shadow.camera.right = 5;
        directionalLight.shadow.camera.top = 5;
        directionalLight.shadow.camera.bottom = -5;
        directionalLight.shadow.bias = -0.0005;
        this.scene.add(directionalLight);
        this.directionalLight = directionalLight;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8; // Lowered for softer, realistic outdoor light

        // PMREM Environment Setup (Essential for metallic/glossy artifacts)
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true; // Enable WebXR
        
        // Post Processing (Priority 4)
        const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
            type: THREE.HalfFloatType, 
            samples: 4 
        });
        this.composer = new EffectComposer(this.renderer, renderTarget);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        
        this.saoPass = new SAOPass(this.scene, this.camera);
        this.saoPass.params.saoBias = 0.5;
        this.saoPass.params.saoIntensity = 0.05; // Subtle
        this.saoPass.params.saoScale = 10;
        this.saoPass.params.saoKernelRadius = 16;
        this.saoPass.params.saoBlurRadius = 8;
        this.saoPass.params.saoBlurStdDev = 4;
        this.saoPass.params.saoBlurDepthCutoff = 0.01;
        this.composer.addPass(this.saoPass);
        
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0px';
        this.renderer.domElement.style.left = '0px';
        this.renderer.domElement.style.zIndex = '50';
        this.renderer.domElement.style.display = 'none'; // Hidden until AR starts
        
        document.body.appendChild(this.renderer.domElement);

        this.currentModel = null;
        this.currentArtifact = null;
        this.currentBaseScale = 0.3;
        this.isActive = false;
        this.modelPlaced = false;
        this.isDragging = false;
        this.dragHoldTimer = null;
        
        // Touch gesture state
        this.touchState = {
            active: false,
            initialDistance: 0,
            initialScale: 0,
            initialAngle: 0,
            initialRotation: 0
        };
        
        // Invisible plane that only receives shadows
        const shadowGeo = new THREE.PlaneGeometry(5, 5);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.6 }); // Stronger contact shadow
        const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.receiveShadow = true;
        shadowPlane.visible = false; // Hidden until placed
        this.scene.add(shadowPlane);
        this.shadowPlane = shadowPlane;
        
        // WebXR Hit Test Variables
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        
        this.reticle = this._createReticle();
        this.scene.add(this.reticle);
        
        this.controller = this.renderer.xr.getController(0);
        this.controller.addEventListener('select', this.onSelect.bind(this));
        this.controller.addEventListener('selectstart', this.onSelectStart.bind(this));
        this.controller.addEventListener('selectend', this.onSelectEnd.bind(this));
        this.scene.add(this.controller);
        
        // Interaction Panel DOM
        this.scaleSlider = document.getElementById('ar-scale-slider');
        this.rotateSlider = document.getElementById('ar-rotate-slider');
        this.initialRotationY = 0;
        
        if (this.scaleSlider) {
             this.scaleSlider.addEventListener('input', (e) => {
                 if (this.currentModel) {
                     const scaleMultiplier = parseFloat(e.target.value);
                     const actualScale = this.currentBaseScale * scaleMultiplier;
                     this.currentModel.scale.set(actualScale, actualScale, actualScale);
                 }
             });
        }
        
        if (this.rotateSlider) {
             this.rotateSlider.addEventListener('input', (e) => {
                 if (this.currentModel) {
                     const degrees = parseFloat(e.target.value);
                     this.currentModel.rotation.y = this.initialRotationY + THREE.MathUtils.degToRad(degrees);
                 }
             });
        }
        
        this._setupTouchGestures();

        window.addEventListener('resize', this._onResize.bind(this));
    }
    
    _setupTouchGestures() {
        const uiLayer = document.getElementById('ar-ui-layer');
        if (!uiLayer) return;

        uiLayer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2 && this.currentModel && this.currentModel.visible) {
                e.preventDefault(); // Prevent standard zoom
                this.touchState.active = true;
                
                // Pinch to Zoom
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.touchState.initialDistance = Math.hypot(dx, dy);
                this.touchState.initialScale = this.currentModel.scale.x;
                
                // Twist to Rotate
                this.touchState.initialAngle = Math.atan2(dy, dx);
                this.touchState.initialRotation = this.currentModel.rotation.y;
            }
        }, { passive: false });

        uiLayer.addEventListener('touchmove', (e) => {
            if (this.touchState.active && e.touches.length === 2 && this.currentModel && this.currentModel.visible) {
                e.preventDefault(); // Prevent standard scroll
                
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                
                // Handle Zoom
                const distance = Math.hypot(dx, dy);
                const scaleFactor = distance / this.touchState.initialDistance;
                let newScale = this.touchState.initialScale * scaleFactor;
                // Min/Max clamp
                newScale = Math.max(this.currentBaseScale * 0.1, Math.min(this.currentBaseScale * 3, newScale));
                this.currentModel.scale.set(newScale, newScale, newScale);
                
                // Sync Slider
                if (this.scaleSlider) {
                    this.scaleSlider.value = (newScale / this.currentBaseScale).toFixed(2);
                }
                
                // Handle Rotate
                const angle = Math.atan2(dy, dx);
                const angleDiff = angle - this.touchState.initialAngle;
                this.currentModel.rotation.y = this.touchState.initialRotation + angleDiff;
                
                // Sync Slider (approximate since touch gives unbounded rotation)
                if (this.rotateSlider) {
                    let deg = THREE.MathUtils.radToDeg(this.currentModel.rotation.y - this.initialRotationY) % 360;
                    if (deg > 180) deg -= 360;
                    if (deg < -180) deg += 360;
                    this.rotateSlider.value = deg.toFixed(0);
                }
            }
        }, { passive: false });

        uiLayer.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                this.touchState.active = false;
            }
        });
    }
    
    _createReticle() {
        // More sophisticated reticle: dual ring
        const reticleGroup = new THREE.Group();
        
        const outerGeo = new THREE.RingGeometry(0.18, 0.2, 32).rotateX(-Math.PI / 2);
        const outerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const outerRing = new THREE.Mesh(outerGeo, outerMat);
        
        const innerGeo = new THREE.RingGeometry(0.12, 0.14, 32).rotateX(-Math.PI / 2);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.9 });
        const innerRing = new THREE.Mesh(innerGeo, innerMat);
        
        reticleGroup.add(outerRing);
        reticleGroup.add(innerRing);
        
        reticleGroup.matrixAutoUpdate = false;
        reticleGroup.visible = false;
        
        // Keep a reference to animate it
        this.reticleInnerRing = innerRing;
        return reticleGroup;
    }

    onSelectStart() {
        if (this.modelPlaced) {
            this.dragHoldTimer = setTimeout(() => {
                this.isDragging = true;
                if (this.currentModel) {
                    this.currentModel.traverse(child => {
                        if (child.isMesh && child.material) {
                            child.userData.originalOpacity = child.material.opacity;
                            child.userData.originalTransparent = child.material.transparent;
                            child.material.transparent = true;
                            child.material.opacity = 0.5;
                            child.material.needsUpdate = true;
                        }
                    });
                }
                
                const dragIndicator = document.getElementById('ar-drag-indicator');
                if (dragIndicator) dragIndicator.classList.remove('hidden');
                
                const instr = document.getElementById('ar-instructions');
                if(instr) instr.textContent = "Move camera to desired location, then release.";
            }, 500);
        }
    }

    onSelectEnd() {
        if (this.dragHoldTimer) {
            clearTimeout(this.dragHoldTimer);
            this.dragHoldTimer = null;
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            
            if (this.currentModel) {
                this.currentModel.traverse(child => {
                    if (child.isMesh && child.material && child.userData.originalOpacity !== undefined) {
                        child.material.opacity = child.userData.originalOpacity;
                        child.material.transparent = child.userData.originalTransparent;
                        child.material.needsUpdate = true;
                    }
                });
                
                if (this.reticle.visible) {
                    this.currentModel.position.setFromMatrixPosition(this.reticle.matrix);
                    this.shadowPlane.position.copy(this.currentModel.position);
                }
            }
            
            const dragIndicator = document.getElementById('ar-drag-indicator');
            if (dragIndicator) dragIndicator.classList.add('hidden');
            
            const instr = document.getElementById('ar-instructions');
            if(instr) instr.textContent = "Model placed! Pinch to scale • Twist to rotate • Hold to move.";
            
            this.reticle.visible = false;
        }
    }

    onSelect() {
        if (this.reticle.visible && this.currentModel && !this.modelPlaced) {
            this.modelPlaced = true;
            this.currentModel.visible = true;
            
            // Move model to reticle's transform
            this.currentModel.position.setFromMatrixPosition(this.reticle.matrix);
            // We usually want models upright, so just copy rotation partially, or just position.
            // setFromMatrixPosition is fine. We will ignore quaternion to keep it strictly vertical
            this.currentModel.quaternion.setFromRotationMatrix(this.reticle.matrix);
            // Ensure model stands upright depending on reticle
            
            // Place shadow plane and make it visible
            this.shadowPlane.position.copy(this.currentModel.position);
            this.shadowPlane.visible = true;
            
            // Reset Interactions & Scale softly
            if (this.scaleSlider) this.scaleSlider.value = 1;
            if (this.rotateSlider) {
                this.rotateSlider.value = 0;
                this.initialRotationY = this.currentModel.rotation.y;
            }
            
            // Animate scale up from 0 to target scale
            this.currentModel.scale.set(0.001, 0.001, 0.001);
            this._animateScale(this.currentModel, this.currentBaseScale, 400);
            
            // Show interaction panel
            const panel = document.getElementById('ar-interaction-panel');
            if(panel) panel.classList.remove('hidden');
            
            const instr = document.getElementById('ar-instructions');
            if(instr) instr.textContent = "Model placed! Pinch to scale • Twist to rotate • Hold to move.";
            
            this.reticle.visible = false;
        }
    }

    _animateScale(obj, targetScale, durationMs) {
        const start = performance.now();
        const tick = () => {
            const passed = performance.now() - start;
            const t = Math.min(passed / durationMs, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - t, 3); 
            const s = 0.001 + (targetScale - 0.001) * eased;
            obj.scale.setScalar(s);
            
            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                obj.scale.setScalar(targetScale); // Ensure it hits exactly
            }
        };
        requestAnimationFrame(tick);
    }

    async start(modelGroup, artifact) {
        if (this.isActive) return;
        
        this.currentArtifact = artifact;
        this.currentBaseScale = artifact?.realWorldHeight || 0.3;
        
        // We must check if WebXR is supported
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!supported) {
            alert("WebXR AR relies on ARCore (Android) or is not supported in this browser. Please use Chrome on Android.");
            // We should let the application revert the UI since start failed
            if (this.onExitCallback) this.onExitCallback();
            return;
        }

        try {
            // Ensure compatibility with devices that don't support 'local-floor' out of the box
            this.renderer.xr.setReferenceSpaceType('local');

            const sessionInit = { 
                requiredFeatures: ['hit-test', 'light-estimation'],
                optionalFeatures: ['dom-overlay', 'local-floor', 'local', 'viewer'],
                domOverlay: { root: document.getElementById('ar-ui-layer') }
            };
            const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
            
            this.isActive = true;
            this.modelPlaced = false;
            this.renderer.domElement.style.display = 'block';
            
            this.currentModel = modelGroup;
            this.currentModel.visible = false; // Hide until placed
            this.scene.add(this.currentModel);
            
            // Reset UI State
            const panel = document.getElementById('ar-interaction-panel');
            if(panel) panel.classList.add('hidden');
            const scanningOverlay = document.getElementById('ar-scanning-overlay');
            if (scanningOverlay) {
                scanningOverlay.classList.remove('hidden');
                scanningOverlay.style.opacity = '1';
                this.surfaceFound = false; // flag to hide scan UI
            }
            const instr = document.getElementById('ar-instructions');
            if(instr) instr.textContent = "Point camera at the floor and move phone side-to-side.";
            
            session.addEventListener('end', () => this.stop(true)); 
            
            if ('requestLightProbe' in session) {
                session.requestLightProbe().then((probe) => {
                    this.xrLightProbe = probe;
                }).catch(err => console.warn('LightProbe not supported', err));
            }
            
            await this.renderer.xr.setSession(session);
            this.renderer.setAnimationLoop(this.render.bind(this));
            
        } catch (e) {
            console.error(e);
            alert("AR initialization failed: " + e.message);
            if (this.onExitCallback) this.onExitCallback();
        }
    }

    stop(fromSessionEvent = false) {
        if (!this.isActive) return;
        this.isActive = false;
        
        this.renderer.setAnimationLoop(null);
        
        if (!fromSessionEvent) {
             const session = this.renderer.xr.getSession();
             if (session) session.end();
        }

        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.currentModel = null;
        }
        this.shadowPlane.visible = false;
        this.xrLightProbe = null;

        this.renderer.domElement.style.display = 'none';
        
        // Priority 5: Dispose shadow map to prevent GPU memory leaks
        if (this.directionalLight && this.directionalLight.shadow && this.directionalLight.shadow.map) {
            this.directionalLight.shadow.map.dispose();
            this.directionalLight.shadow.map = null;
        }
        
        if (this.onExitCallback) this.onExitCallback();
    }
    
    setExitCallback(cb) {
        this.onExitCallback = cb;
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    render(timestamp, frame) {
        if (frame) {
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const session = this.renderer.xr.getSession();

            if (this.hitTestSourceRequested === false) {
                session.requestReferenceSpace('viewer').then((viewerSpace) => {
                    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
                        this.hitTestSource = source;
                    });
                });
                session.addEventListener('end', () => {
                    this.hitTestSourceRequested = false;
                    this.hitTestSource = null;
                });
                this.hitTestSourceRequested = true;
            }

            if (this.hitTestSource) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);
                if (hitTestResults.length > 0 && (!this.modelPlaced || this.isDragging)) {
                    const hit = hitTestResults[0];
                    this.reticle.visible = true;
                    this.reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                    
                    if (this.isDragging && this.currentModel) {
                        this.currentModel.position.setFromMatrixPosition(this.reticle.matrix);
                        this.shadowPlane.position.copy(this.currentModel.position);
                    }
                    
                    // Animate reticle
                    const time = performance.now() * 0.005;
                    this.reticleInnerRing.scale.setScalar(1.0 + Math.sin(time) * 0.1);
                    
                    // Hide scan UI once surface is found
                    if (!this.surfaceFound) {
                        this.surfaceFound = true;
                        const scanUI = document.getElementById('ar-scanning-overlay');
                        if (scanUI) scanUI.style.opacity = '0';
                        const instr = document.getElementById('ar-instructions');
                        if(instr) instr.textContent = "Tap the ring to place your artifact.";
                    }
                } else {
                    this.reticle.visible = false;
                }
            }

            if (this.xrLightProbe && frame.getLightEstimate) {
                const lightEstimate = frame.getLightEstimate(this.xrLightProbe);
                if (lightEstimate) {
                    const intensity = lightEstimate.primaryLightIntensity;
                    const direction = lightEstimate.primaryLightDirection;
                    if (intensity && direction) {
                        this.directionalLight.intensity = intensity.y; // luminance
                        this.directionalLight.position.set(-direction.x, -direction.y, -direction.z);
                    }
                }
            }
        }

        // It is recommended for standard AR to just use renderer to hit XR backbuffer, 
        // however for advanced rendering with composer we call composer.render()
        // If composer breaks XR, fallback to this.renderer.render
        this.renderer.render(this.scene, this.camera);
    }
}
