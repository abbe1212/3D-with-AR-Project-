export class UIController {
    constructor() {
        this.galleryList = document.getElementById('gallery-list');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingProgress = document.getElementById('loading-progress');
        this.controlsPanel = document.getElementById('controls-panel');
        this.artifactTitle = document.getElementById('current-artifact-title');
        this.arUILayer = document.getElementById('ar-ui-layer');
        this.viewerContainer = document.getElementById('viewer-container');
        
        // Buttons
        this.btnResetCam = document.getElementById('btn-reset-cam');
        this.btnEnterAR = document.getElementById('btn-enter-ar');
        this.btnExitAR = document.getElementById('btn-exit-ar');
        
        // Callbacks
        this.onArtifactSelect = null;
        this.onResetCamera = null;
        this.onEnterAR = null;
        this.onExitAR = null;
        
        this._bindEvents();
    }

    _bindEvents() {
        this.btnResetCam.addEventListener('click', () => this.onResetCamera && this.onResetCamera());
        this.btnEnterAR.addEventListener('click', () => this.onEnterAR && this.onEnterAR());
        this.btnExitAR.addEventListener('click', () => {
             this._handleModeChange('3d');
             this.onExitAR && this.onExitAR();
        });
        
        // Allow exiting AR with escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.arUILayer.classList.contains('hidden')) {
                this.btnExitAR.click();
            }
        });
    }

    renderGallery(artifacts) {
        this.galleryList.innerHTML = '';
        
        artifacts.forEach((artifact, index) => {
            const card = document.createElement('div');
            card.className = 'artifact-card';
            card.dataset.id = artifact.id;
            
            card.innerHTML = `
                <h3>${artifact.name}</h3>
                <p>${artifact.description}</p>
            `;
            
            card.addEventListener('click', () => {
                // Remove active from all
                document.querySelectorAll('.artifact-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                
                if (this.onArtifactSelect) {
                    this.onArtifactSelect(artifact);
                }
            });
            
            this.galleryList.appendChild(card);
            
            // Auto click first item
            if (index === 0) {
                card.click();
            }
        });
    }

    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
        this.loadingOverlay.style.opacity = '1';
        this.updateProgress(0);
        this.controlsPanel.classList.add('hidden');
    }

    updateProgress(percent) {
        this.loadingProgress.style.width = `${percent}%`;
    }

    hideLoading(artifactName) {
        this.loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            this.loadingOverlay.classList.add('hidden');
            this.controlsPanel.classList.remove('hidden');
            this.artifactTitle.textContent = artifactName || 'Artifact';
        }, 400); // match transition length
    }

    showError(msg) {
        alert("Error loading artifact: " + msg);
        this.hideLoading();
    }

    /**
     * Swaps the UI between '3d' and 'ar' modes
     */
    _handleModeChange(mode) {
        if (mode === 'ar') {
            document.body.classList.add('ar-mode-active');
            this.controlsPanel.classList.add('hidden');
            this.arUILayer.classList.remove('hidden');
            this.viewerContainer.style.visibility = 'hidden'; // Hide 3D canvas temporarily
        } else {
            document.body.classList.remove('ar-mode-active');
            this.arUILayer.classList.add('hidden');
            this.viewerContainer.style.visibility = 'visible';
            this.controlsPanel.classList.remove('hidden');
        }
    }
    
    enterARMode() {
        this._handleModeChange('ar');
    }
}
