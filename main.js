import { ModelLoader } from './js/model-loader.js';
import { Viewer } from './js/viewer.js';
import { ARViewer } from './js/ar-viewer.js';
import { UIController } from './js/ui-controller.js';

// Setup Application State
class App {
    constructor() {
        this.modelLoader = new ModelLoader();
        this.ui = new UIController();
        
        // Initialize 3D Viewer Mode (Default)
        const container = document.getElementById('viewer-container');
        this.viewer = new Viewer(container);
        
        // Initialize AR Viewer Mode (Lazyload on request)
        this.arViewer = new ARViewer();
        
        this.currentArtifact = null;
        this.currentModelGroup = null; // THREE.Group
        this.modelsConfig = null;

        this._bindUI();
        this.init();
    }

    _bindUI() {
        this.ui.onArtifactSelect = async (artifact) => {
            this.currentArtifact = artifact;
            await this.loadCurrentArtifact();
        };

        this.ui.onResetCamera = () => {
             this.viewer.resetCamera();
        };

        this.ui.onEnterAR = async () => {
             if (!this.currentArtifact) return;
             
             this.ui.showLoading();
             
             let arModelGroup = this.currentModelGroup;
             
             try {
                 const arUrl = this.currentArtifact.arModelUrl || this.currentArtifact.modelUrl;
                 
                 // Fetch optimized AR LOD model if differs from desktop viewer model
                 if (arUrl !== this.currentArtifact.modelUrl) {
                     arModelGroup = await this.modelLoader.load(arUrl, (percent) => this.ui.updateProgress(percent));
                 } else {
                     this.viewer.scene.remove(this.currentModelGroup);
                 }
                 
                 this.ui.enterARMode();
                 await this.arViewer.start(arModelGroup, this.currentArtifact);
                 this.ui.hideLoading();
                 
             } catch (e) {
                 console.error("Error entering AR:", e);
                 this.ui.showError(e.message);
             }
        };

        this.ui.onExitAR = () => {
            // Stop AR
            this.arViewer.stop();
            
            // Re-attach model to 3D scene
            if (this.currentModelGroup) {
                this.viewer.loadModel(this.currentModelGroup);
            }
        };

        // When the WebXR session abruptly ends (User hit the native back button or close)
        this.arViewer.setExitCallback(() => {
            if (document.body.classList.contains('ar-mode-active')) {
                // Trigger the UI's exit routine implicitly 
                this.ui.btnExitAR.click();
            }
        });
    }

    async init() {
         try {
             const response = await fetch('data/models.json');
             if (!response.ok) throw new Error('Failed to load JSON');
             this.modelsConfig = await response.json();
             
             // Configure ModelLoader's proxy
             if (this.modelsConfig.proxyUrl) {
                 this.modelLoader.setProxy(this.modelsConfig.proxyUrl);
             }

             // Render gallery and select the first item automatically
             this.ui.renderGallery(this.modelsConfig.artifacts);
             
         } catch (e) {
             console.error('Initialization error:', e);
             this.ui.showError('Could not load configuration.');
         }
    }

    async loadCurrentArtifact() {
         if (!this.currentArtifact) return;

         this.ui.showLoading();

         try {
             // Remove old model from scene (but don't dispose it from GPU yet as it is cached)
             if (this.currentModelGroup) {
                 this.viewer.scene.remove(this.currentModelGroup);
             }

             // Fetch new model
             const group = await this.modelLoader.load(
                 this.currentArtifact.modelUrl,
                 (percent) => this.ui.updateProgress(percent)
             );

             this.currentModelGroup = group;
             
             // Load it into the active viewer
             this.viewer.loadModel(this.currentModelGroup);
             
             this.ui.hideLoading(this.currentArtifact.name);
         } catch(e) {
             console.error('Error loading artifact:', e);
             this.ui.showError(e.message);
         }
    }
}

// Bootstrap
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
} else {
    window.app = new App();
}
