import React, { useEffect, useRef, useState } from 'react';

const { Autodesk, THREE } = window;

const APSViewer = ({ token, urn, sensorData }) => {
  const viewerRef = useRef(null);
  const viewerInstance = useRef(null);
  const isMountedRef = useRef(false);
  const [isViewerInitialized, setIsViewerInitialized] = useState(false);

  // 1. Initialize Runtime
  useEffect(() => {
    isMountedRef.current = true;
    if (!token || !urn) return;
    
    const options = { env: 'AutodeskProduction', accessToken: token, isAEC: true };

    Autodesk.Viewing.Initializer(options, () => {
      if (!isMountedRef.current || viewerInstance.current) return;

      const viewerDiv = viewerRef.current;
      viewerInstance.current = new Autodesk.Viewing.GuiViewer3D(viewerDiv);

      const code = viewerInstance.current.start();
      if (code === 0) {
        setIsViewerInitialized(true);
      }
    });

    return () => {
      isMountedRef.current = false;
      if (viewerInstance.current) {
        const viewer = viewerInstance.current;
        viewerInstance.current = null;
        setTimeout(() => viewer.finish(), 0);
        setIsViewerInitialized(false);
      }
    };
  }, [token, urn]);

  // 2. Load Model, Sprite, Zoom Logic, and Interactions
  useEffect(() => {
    if (!isViewerInitialized || !urn || !viewerInstance.current) return;

    const currentViewer = viewerInstance.current;
    const documentId = 'urn:' + urn;
    let animationInterval = null; 

    Autodesk.Viewing.Document.load(documentId, (doc) => {
      if (!isMountedRef.current || !currentViewer.impl) return;
      const defaultModel = doc.getRoot().getDefaultGeometry();
      
      currentViewer.loadDocumentNode(doc, defaultModel).then(async (model) => {
        if (!isMountedRef.current) return;

        try {
            await currentViewer.loadExtension("Autodesk.AEC.LevelsExtension");
            const extId = "Autodesk.DataVisualization";
            const dataVizExt = await currentViewer.loadExtension(extId);
            
            if (dataVizExt && isMountedRef.current) {
                const DataVizCore = Autodesk.DataVisualization.Core;

                // --- 1. SETUP SPRITE ON DESK ---
                const dbId = 5685; // UPDATED: Sensor/Desk ID
                const position = new THREE.Vector3(-16.870, -27.031, -1.257); // UPDATED: New Coords
                position.z += 1.5; 

                const viewableType = DataVizCore.ViewableType.SPRITE;
                const spriteColor = new THREE.Color(0xffffff); 
                const spriteIconUrl = "sprites/thermostat.svg"; 
                const animFrames = ["sprites/thermostat.svg", "sprites/thermostat_red.svg"];

                const viewableStyle = new DataVizCore.ViewableStyle(
                    viewableType, spriteColor, spriteIconUrl, new THREE.Color(0xffffff), spriteIconUrl, animFrames 
                );
                
                const viewableData = new DataVizCore.ViewableData();
                viewableData.spriteSize = 48; 
                const spriteViewable = new DataVizCore.SpriteViewable(position, viewableStyle, dbId);
                viewableData.addViewable(spriteViewable);

                await viewableData.finish(); 
                dataVizExt.addViewables(viewableData);
                dataVizExt.showHideViewables(true, false);
                currentViewer.impl.invalidate(true);

                // --- 2. CLICK INTERACTION (Comfortable Zoom) ---
                const onSpriteClick = (event) => {
                    if (event.dbId === dbId) {
                        const nav = currentViewer.navigation;
                        const frags = currentViewer.model.getFragmentList();
                        const tree = currentViewer.model.getInstanceTree();
                        const bounds = new THREE.Box3();

                        // Calculate bounds of the desk
                        tree.enumNodeFragments(dbId, (fragId) => {
                            const box = new THREE.Box3();
                            frags.getWorldBounds(fragId, box);
                            bounds.union(box);
                        }, true);

                        const center = bounds.getCenter(new THREE.Vector3());
                        const size = bounds.getSize(new THREE.Vector3()).length(); 

                        // DISTANCE LOGIC: 2.5x the diagonal size = 85% zoom intensity
                        const currentPos = nav.getPosition();
                        const currentTarget = nav.getTarget();
                        const dir = new THREE.Vector3().subVectors(currentPos, currentTarget).normalize();
                        const distance = size * 30; 
                        const newPos = center.clone().add(dir.multiplyScalar(distance));

                        nav.setTarget(center);
                        nav.setPosition(newPos);
                    }
                };
                currentViewer.addEventListener(DataVizCore.MOUSE_CLICK, onSpriteClick);


                // --- 3. INITIAL ZOOM (Zoom IN Closer) ---
                currentViewer.fitToView([], false); 
                setTimeout(() => {
                   if (!currentViewer.navigation) return;
                   const nav = currentViewer.navigation;
                   const pos = nav.getPosition();
                   const target = nav.getTarget();
                   const viewDir = new THREE.Vector3();
                   viewDir.subVectors(pos, target);
                   const dist = viewDir.length();
                   
                   // Load Zoom: 0.8x (Closer)
                   const newDist = dist * 0.8; 
                   
                   viewDir.normalize().multiplyScalar(newDist);
                   const newPos = new THREE.Vector3().addVectors(target, viewDir);
                   nav.setPosition(newPos);
                }, 100);


/*                 // --- 4. AUTO-HIDE ROOF ---
                setTimeout(() => {
                    const roofDbId = 5650; // UPDATED: New Roof ID
                    currentViewer.hide(roofDbId);
                    currentViewer.impl.invalidate(true);
                }, 10000);  */


                // --- 5. ANIMATION LOOP ---
                let frameIndex = 0;
                const spritesToUpdate = [dbId]; 
                animationInterval = setInterval(() => {
                    frameIndex = (frameIndex + 1) % animFrames.length;
                    dataVizExt.invalidateViewables(spritesToUpdate, () => ({ url: animFrames[frameIndex] }));
                    currentViewer.impl.invalidate(true);
                }, 500); 


                // --- 6. TOOLBAR BUTTON ---
                const createToolbarButton = () => {
                    const toolbar = currentViewer.getToolbar();
                    if (!toolbar) { setTimeout(createToolbarButton, 500); return; }
                    let subToolbar = toolbar.getControl('iot-toolbar-group');
                    if (!subToolbar) {
                        subToolbar = new Autodesk.Viewing.UI.ControlGroup('iot-toolbar-group');
                        toolbar.addControl(subToolbar);
                    }
                    if (subToolbar.getControl('sensor-toggle-button')) {
                        subToolbar.removeControl('sensor-toggle-button');
                    }
                    const sensorButton = new Autodesk.Viewing.UI.Button('sensor-toggle-button');
                    sensorButton.icon.classList.add('adsk-button-icon', 'adsk-icon-visible'); 
                    sensorButton.setToolTip('Show/Hide Sensors');
                    sensorButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE); 
                    let sensorsVisible = true;
                    sensorButton.onClick = () => {
                        sensorsVisible = !sensorsVisible;
                        sensorButton.setState(sensorsVisible ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
                        dataVizExt.showHideViewables(sensorsVisible, false);
                        currentViewer.impl.invalidate(true);
                    };
                    subToolbar.addControl(sensorButton);
                };
                createToolbarButton();
            }
        } catch (err) {}
      });
    }, (errCode, errMsg) => {});

    return () => {
        if (animationInterval) clearInterval(animationInterval);
        if (currentViewer && Autodesk.DataVisualization) {
             const DataVizCore = Autodesk.DataVisualization.Core;
             currentViewer.removeEventListener(DataVizCore.MOUSE_CLICK, () => {}); 
        }
    };

  }, [isViewerInitialized, urn]);

  return (
    <div ref={viewerRef} style={{ position: 'relative', width: '100%', height: '100%' }} />
  );
};

export default APSViewer;