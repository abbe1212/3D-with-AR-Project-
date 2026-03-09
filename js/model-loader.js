import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/**
 * Handles fetching, loading, and pre-processing GLB models.
 */
export class ModelLoader {
    constructor() {
        this.loader = new GLTFLoader();
        
        // Setup Draco Loader for compressed GLB files
        const dracoLoader = new DRACOLoader();
        // Use CDN for the Draco WASM decoder files corresponding to Three.js r164
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/libs/draco/');
        this.loader.setDRACOLoader(dracoLoader);
        
        // Setup KTX2 Loader for compressed textures (Basis)
        const ktx2Loader = new KTX2Loader();
        ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/libs/basis/');
        // WebGLRenderer needed to detect support capabilities
        const tempRenderer = new THREE.WebGLRenderer();
        ktx2Loader.detectSupport(tempRenderer);
        this.loader.setKTX2Loader(ktx2Loader);
        tempRenderer.dispose();
        
        this.proxyUrl = ''; 
        this.cache = new Map(); // Store downloaded models
    }

    setProxy(url) {
        this.proxyUrl = url;
    }

    /**
     * Loads a 3D model from a URL, optionally applying the CORS proxy if it's a Google Drive link.
     */
    async load(url, onProgress) {
        // Return cloned model from cache if it already exists
        if (this.cache.has(url)) {
            const cachedModel = this.cache.get(url);
            if (onProgress) onProgress(100);
            return cachedModel.clone(); // Return a clone so we can safely modify it/remove it from scenes
        }

        let fetchUrl = url;
        
        // If it's a Google Drive link and we have a proxy configured, use the proxy
        if (url.includes('drive.google.com') && this.proxyUrl) {
            fetchUrl = `${this.proxyUrl}${encodeURIComponent(url)}`;
        }

        return new Promise((resolve, reject) => {
            this.loader.load(
                fetchUrl,
                (gltf) => {
                    const originalModel = gltf.scene;
                    const wrapper = this._normalizeModel(originalModel);
                    this.cache.set(url, wrapper); // Save to cache
                    resolve(wrapper);
                },
                (xhr) => {
                    if (onProgress) {
                        const percent = xhr.total > 0 ? (xhr.loaded / xhr.total) * 100 : 0;
                        onProgress(percent);
                    }
                },
                (error) => {
                    console.error('An error happened loading the model:', error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Centers the model on the origin and scales it uniformly to fit within a 1x1x1 bounding box.
     */
    _normalizeModel(model) {
        // Enable shadows for AR realism
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Enhance material for PBR realism
                if (child.material) {
                    // Ensure environment reflections are visible
                    child.material.envMapIntensity = 1.0;
                    
                    // If it's a standard material, give it some realistic defaults 
                    // if it lacks specific texture maps
                    if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
                        if (!child.material.roughnessMap && child.material.roughness !== undefined) {
                            child.material.roughness = Math.min(0.6, child.material.roughness || 0.6);
                        }
                        if (!child.material.metalnessMap && child.material.metalness !== undefined) {
                            child.material.metalness = Math.max(0.1, child.material.metalness || 0.1);
                        }
                    }
                    child.material.needsUpdate = true;
                }
            }
        });

        // Compute bounding box
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // We wrap the model in a group so its centering position isn't overwritten later
        const wrapper = new THREE.Group();
        wrapper.add(model);

        // Center the inner model relative to the wrapper, but anchor bottom to Y=0
        model.position.x = -center.x;
        model.position.y = -box.min.y;
        model.position.z = -center.z;

        // Scale the wrapper to a standard size (max dimension = 1.0)
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scale = 1.0 / maxDim;
            wrapper.scale.set(scale, scale, scale);
        }

        return wrapper;
    }

    /**
     * Helper to properly dispose of a model's resources from GPU memory
     */
    dispose(model) {
        if (!model) return;
        
        model.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.isMaterial) {
                    this._disposeMaterial(child.material);
                } else if (Array.isArray(child.material)) {
                    child.material.forEach(mat => this._disposeMaterial(mat));
                }
            }
        });
    }

    _disposeMaterial(material) {
        material.dispose();
        // Traverse and dispose any textures attached to the material
        for (const key in material) {
            if (material[key] && material[key].isTexture) {
                material[key].dispose();
            }
        }
    }
}
