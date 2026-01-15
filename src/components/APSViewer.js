import React, { useEffect, useRef, useState, useCallback } from 'react';

const { Autodesk, THREE } = window;

const APSViewer = ({ token, urn, sensorData, sensorHistory = [] }) => {
  const viewerDivRef = useRef(null);
  const viewerInstanceRef = useRef(null);
  const isMountedRef = useRef(false);
  const sensorPosRef = useRef(null); 

  // UI STATE
  const [popupData, setPopupData] = useState(null); 
  const [showDetailPanel, setShowDetailPanel] = useState(false); 
  
  // REFS FOR DATA
  const dataRef = useRef(sensorData);
  const historyRef = useRef(sensorHistory);

  useEffect(() => {
    dataRef.current = sensorData;
    historyRef.current = sensorHistory;
  }, [sensorData, sensorHistory]);

  // --- HELPER: PROCESS DAILY AVERAGES ---
  const getDailyAverages = (history, key) => {
      if (!history || history.length === 0) return [];

      const groups = history.reduce((acc, curr) => {
          // FORMAT: MM/DD/YY
          const date = new Date(curr.lastUpdated).toLocaleDateString('en-US', {
              month: '2-digit', day: '2-digit', year: '2-digit'
          });
          
          if (!acc[date]) acc[date] = { sum: 0, count: 0, date };
          
          const val = Number(curr[key]);
          if (!isNaN(val)) {
              acc[date].sum += val;
              acc[date].count += 1;
          }
          return acc;
      }, {});

      // Returns Array sorted Oldest -> Newest
      return Object.values(groups)
          .map(g => ({
              date: g.date,
              value: g.sum / g.count,
              rawDateObj: new Date(g.date) // Store helper date object
          }))
          .reverse(); 
  };

  // --- 1. SETUP LOGIC ---
  const setupSprites = useCallback(async (viewer, dataVizExt) => {
      const DataVizCore = Autodesk.DataVisualization.Core;
      const dbId = 5685; 
      const position = new THREE.Vector3(-16.870, -27.031, -1.257); 
      position.z += 1.5; 
      sensorPosRef.current = position.clone();
      sensorPosRef.current.z += 1.0; 

      const viewableType = DataVizCore.ViewableType.SPRITE;
      const spriteColor = new THREE.Color(0xffffff); 
      const spriteIconUrl = "sprites/thermostat.svg"; 
      const animFrames = ["sprites/thermostat.svg", "sprites/thermostat_red.svg"];

      const viewableStyle = new DataVizCore.ViewableStyle(
          viewableType, spriteColor, spriteIconUrl,
          new THREE.Color(0xffffff), spriteIconUrl, animFrames 
      );
      
      const viewableData = new DataVizCore.ViewableData();
      viewableData.spriteSize = 48; 
      const spriteViewable = new DataVizCore.SpriteViewable(position, viewableStyle, dbId);
      viewableData.addViewable(spriteViewable);
      await viewableData.finish(); 
      dataVizExt.addViewables(viewableData);
      dataVizExt.showHideViewables(true, false);
      
      let frameIndex = 0;
      setInterval(() => {
          if (!viewer.model || !viewer.impl) return;
          frameIndex = (frameIndex + 1) % animFrames.length;
          dataVizExt.invalidateViewables([dbId], () => ({ url: animFrames[frameIndex] }));
          viewer.impl.invalidate(true);
      }, 500);

      viewer.addEventListener(DataVizCore.MOUSE_CLICK, (event) => {
          if (event.dbId === dbId) {
             const screenPoint = viewer.worldToClient(sensorPosRef.current);
             setPopupData({ x: screenPoint.x, y: screenPoint.y });
          } else {
             setPopupData(null);
          }
      });

      viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, () => {
          if (sensorPosRef.current) {
              const screenPoint = viewer.worldToClient(sensorPosRef.current);
              setPopupData(prev => prev ? { ...prev, x: screenPoint.x, y: screenPoint.y } : null);
          }
      });

      viewer.fitToView([], false);
  }, []);

  const setupToolbar = useCallback((viewer, dataVizExt) => {
      const toolbar = viewer.getToolbar();
      if (!toolbar) { setTimeout(() => setupToolbar(viewer, dataVizExt), 500); return; }
      
      let subToolbar = toolbar.getControl('iot-toolbar-group');
      if (!subToolbar) {
          subToolbar = new Autodesk.Viewing.UI.ControlGroup('iot-toolbar-group');
          toolbar.addControl(subToolbar);
      }

      if (subToolbar.getControl('sensor-toggle-button')) subToolbar.removeControl('sensor-toggle-button');
      const sensorButton = new Autodesk.Viewing.UI.Button('sensor-toggle-button');
      sensorButton.icon.classList.add('adsk-button-icon', 'adsk-icon-visible'); 
      sensorButton.setToolTip('Show/Hide Sensors');
      sensorButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE); 
      let sensorsVisible = true;
      sensorButton.onClick = () => {
          sensorsVisible = !sensorsVisible;
          sensorButton.setState(sensorsVisible ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
          dataVizExt.showHideViewables(sensorsVisible, false);
          viewer.impl.invalidate(true);
      };
      subToolbar.addControl(sensorButton);

      if (subToolbar.getControl('sensor-detail-button')) subToolbar.removeControl('sensor-detail-button');
      const detailButton = new Autodesk.Viewing.UI.Button('sensor-detail-button');
      detailButton.icon.classList.add('adsk-button-icon', 'adsk-icon-properties'); 
      detailButton.setToolTip('Sensor History Details');
      detailButton.onClick = () => {
          setShowDetailPanel(prev => !prev);
      };
      subToolbar.addControl(detailButton);
  }, []);

  const onModelLoaded = useCallback(async (model, viewer) => {
    try {
        await viewer.loadExtension("Autodesk.AEC.LevelsExtension");
        const extId = "Autodesk.DataVisualization";
        const dataVizExt = await viewer.loadExtension(extId);

        if (dataVizExt) {
            setupSprites(viewer, dataVizExt);
            setupToolbar(viewer, dataVizExt);
        }
    } catch (err) {
        console.error("Extension Error:", err);
    }
  }, [setupSprites, setupToolbar]);


  // --- 2. VIEWER INITIALIZATION ---
  useEffect(() => {
    isMountedRef.current = true;
    if (!token || !urn) return;

    const options = { env: 'AutodeskProduction', accessToken: token, isAEC: true };

    Autodesk.Viewing.Initializer(options, () => {
      if (!isMountedRef.current || viewerInstanceRef.current || !viewerDivRef.current) return;

      const viewer = new Autodesk.Viewing.GuiViewer3D(viewerDivRef.current);
      viewerInstanceRef.current = viewer;
      
      const code = viewer.start();
      if (code === 0) {
        viewer.setTheme('dark-theme');
        Autodesk.Viewing.Document.load('urn:' + urn, (doc) => {
            const defaultModel = doc.getRoot().getDefaultGeometry();
            viewer.loadDocumentNode(doc, defaultModel).then((model) => onModelLoaded(model, viewer));
        });
      }
    });

    return () => {
      isMountedRef.current = false;
      if (viewerInstanceRef.current) {
        viewerInstanceRef.current.finish();
        viewerInstanceRef.current = null;
      }
    };
  }, [token, urn, onModelLoaded]);


  // --- 3. CHARTS ---
  const MiniSparkline = ({ data = [], color }) => {
    if (!data || data.length < 2) return <div style={{fontSize:'10px', color:'#555'}}>Loading...</div>;
    const width = 260, height = 40;
    const values = data.map(d => Number(d.value));
    const maxVal = Math.max(...values) + 1; 
    const minVal = Math.min(...values) - 1;
    const range = maxVal - minVal || 1;
    const points = values.map((val, i) => `${(i / (values.length - 1)) * width},${height - ((val - minVal) / range) * height}`).join(' ');

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{overflow:'visible', marginTop:'5px'}}>
            <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
            <circle cx={width} cy={height - ((values[values.length-1] - minVal) / range) * height} r="3" fill={color} />
        </svg>
    );
  };

  const DetailChart = ({ dailyData = [], rawHistory = [], dataKey, color, label, unit }) => {
    if (!dailyData || dailyData.length === 0) return <div style={{color:'#666', fontSize:'12px'}}>Insufficient Data</div>;
    
    // 1. Find Raw Extremes & Objects
    const validRaw = rawHistory.filter(d => !isNaN(Number(d[dataKey])));
    let maxObj = validRaw[0], minObj = validRaw[0];
    
    validRaw.forEach(d => {
        if (Number(d[dataKey]) > Number(maxObj[dataKey])) maxObj = d;
        if (Number(d[dataKey]) < Number(minObj[dataKey])) minObj = d;
    });

    const trueMax = Number(maxObj[dataKey]);
    const trueMin = Number(minObj[dataKey]);

    // 2. Chart Scaling (Must accommodate RAW peaks/valleys, not just averages)
    const avgValues = dailyData.map(d => d.value);
    // Expand scale to fit outliers
    const plotMax = Math.max(...avgValues, trueMax);
    const plotMin = Math.min(...avgValues, trueMin);
    const range = plotMax - plotMin || 1;
    
    const width = 600;
    const height = 100;
    const step = width / (dailyData.length - 1 || 1);

    // 3. Helper to Map Time to X
    // (We use the daily avg start/end as the timeline bounds)
    const timeStart = new Date(dailyData[0].date).getTime();
    const timeEnd = new Date(dailyData[dailyData.length-1].date).getTime();
    const timeRange = timeEnd - timeStart || 1;

    const getXFromTime = (isoString) => {
        const t = new Date(isoString).getTime();
        const pct = (t - timeStart) / timeRange;
        // Clamp between 0 and width to keep dots inside chart area
        return Math.max(0, Math.min(width, pct * width));
    };

    // 4. Calculate Daily Points
    const pointsWithData = dailyData.map((d, i) => {
        const x = (i / (dailyData.length - 1 || 1)) * width;
        const y = height - ((d.value - plotMin) / range) * height; 
        return { x, y, value: d.value, date: d.date };
    });

    const polylinePoints = pointsWithData.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <div style={{marginBottom:'25px'}}> 
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px', fontSize:'12px', color:'#aaa'}}>
                <span style={{color: color, fontWeight:'bold', textTransform:'uppercase'}}>{label}</span>
                <span>
                    <span style={{color:'#ff4d4d', fontWeight:'bold'}}>Max: {trueMax.toFixed(1)} {unit}</span>
                    <span style={{margin:'0 8px', color:'#444'}}>|</span>
                    <span style={{color:'#4d94ff', fontWeight:'bold'}}>Min: {trueMin.toFixed(1)} {unit}</span>
                </span>
            </div>
            <div style={{border:'1px solid #333', background:'rgba(0,0,0,0.3)', padding:'10px', borderRadius:'4px', position:'relative'}}>
                <svg width="100%" height="100px" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{overflow:'visible'}}>
                    
                    {/* Area Fill */}
                    <polygon points={`0,${height} ${polylinePoints} ${width},${height}`} fill={color} fillOpacity="0.1" />
                    
                    {/* The Line */}
                    <polyline fill="none" stroke={color} strokeWidth="3" points={polylinePoints} strokeLinecap="round" strokeLinejoin="round"/>
                    
                    {/* Daily Average Points (Standard) */}
                    {pointsWithData.map((p, i) => {
                        const isPeak = p.y < 20; 
                        const labelY = isPeak ? p.y + 20 : p.y - 12;
                        const labelX = p.x - (step / 2);

                        return (
                            <g key={i}>
                                <line x1={p.x} y1="0" x2={p.x} y2={height} stroke="#444" strokeDasharray="3" strokeWidth="1" />
                                <circle cx={p.x} cy={p.y} r="3" fill="#1a1a1a" stroke={color} strokeWidth="2" />
                                <text x={p.x} y={labelY} textAnchor="middle" fill={color} fontSize="10px" fontWeight="bold" style={{pointerEvents:'none', textShadow:'0px 1px 3px rgba(0,0,0,0.9)'}}>
                                    {p.value.toFixed(1)}
                                </text>
                                <text x={labelX} y={height + 20} textAnchor="middle" fill="#888" fontSize="10px" fontFamily="monospace" style={{pointerEvents:'none'}}>
                                    {p.date}
                                </text>
                            </g>
                        );
                    })}

                    {/* --- EXTREME POINTS (MIN / MAX) --- */}
                    
                    {/* MAX Point (RED) */}
                    <g>
                        <circle 
                            cx={getXFromTime(maxObj.lastUpdated)} 
                            cy={height - ((trueMax - plotMin) / range) * height} 
                            r="5" fill="#ff4d4d" stroke="#fff" strokeWidth="2" 
                        />
                         <text 
                            x={getXFromTime(maxObj.lastUpdated)} 
                            y={height - ((trueMax - plotMin) / range) * height - 10} 
                            textAnchor="middle" fill="#ff4d4d" fontSize="11px" fontWeight="bold" 
                            style={{pointerEvents:'none', textShadow:'0px 1px 4px #000'}}
                        >
                            {trueMax.toFixed(1)}
                        </text>
                    </g>

                    {/* MIN Point (BLUE) */}
                    <g>
                        <circle 
                            cx={getXFromTime(minObj.lastUpdated)} 
                            cy={height - ((trueMin - plotMin) / range) * height} 
                            r="5" fill="#4d94ff" stroke="#fff" strokeWidth="2" 
                        />
                         <text 
                            x={getXFromTime(minObj.lastUpdated)} 
                            y={height - ((trueMin - plotMin) / range) * height + 20} 
                            textAnchor="middle" fill="#4d94ff" fontSize="11px" fontWeight="bold" 
                            style={{pointerEvents:'none', textShadow:'0px 1px 4px #000'}}
                        >
                            {trueMin.toFixed(1)}
                        </text>
                    </g>

                </svg>
            </div>
        </div>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        
        <div ref={viewerDivRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} />

        {/* SMALL POPUP */}
        {popupData && !showDetailPanel && (
            <div style={{
                position: 'absolute', left: popupData.x, top: popupData.y,
                transform: 'translate(-50%, -100%) translateY(-20px)', width: '300px',
                background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #00f7ff', borderRadius: '8px',
                padding: '15px', zIndex: 20, pointerEvents: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(5px)', fontFamily: 'Segoe UI, monospace', display: 'flex', flexDirection: 'column', gap: '15px'
            }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #333', paddingBottom:'8px', pointerEvents: 'auto'}}>
                    <h3 style={{margin:0, fontSize:'14px', color:'#fff', fontWeight:'bold'}}>MXCHIP-NELSON</h3>
                    <button onClick={() => setPopupData(null)} style={{background:'none', border:'none', color:'#888', cursor:'pointer', fontSize:'16px', padding:0}}>✕</button>
                </div>
                <div>
                    <span style={{fontSize:'11px', color:'#00f7ff', fontWeight:'600'}}>TEMP</span>
                    <MiniSparkline data={historyRef.current?.slice(0, 50).map(h => ({ value: h.temp })).reverse()} color="#00f7ff" />
                </div>
                <div>
                    <span style={{fontSize:'11px', color:'#00ff9d', fontWeight:'600'}}>HUMIDITY</span>
                    <MiniSparkline data={historyRef.current?.slice(0, 50).map(h => ({ value: h.humidity })).reverse()} color="#00ff9d" />
                </div>
                <div>
                    <span style={{fontSize:'11px', color:'#ffcc00', fontWeight:'600'}}>PRESSURE</span>
                    <MiniSparkline data={historyRef.current?.slice(0, 50).map(h => ({ value: h.pressure })).reverse()} color="#ffcc00" />
                </div>
            </div>
        )}

        {/* LARGE DETAIL DASHBOARD */}
        {showDetailPanel && (
            <div onClick={(e) => { if(e.target === e.currentTarget) setShowDetailPanel(false); }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.7)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ 
                    width: '700px', 
                    height: 'auto', 
                    maxHeight: '95vh', 
                    overflow: 'hidden', 
                    background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #00f7ff', boxShadow: '0 0 40px rgba(0, 247, 255, 0.2)', backdropFilter: 'blur(5px)', borderRadius: '8px', 
                    padding: '25px', 
                    position: 'relative', fontFamily: 'Segoe UI, sans-serif' 
                }}>
                    
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'10px'}}>
                        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start'}}>
                            <h2 style={{margin:0, color:'#fff', fontSize:'24px', letterSpacing:'1px'}}>MXCHIP-NELSON</h2>
                            <div style={{color:'#888', fontSize:'12px', marginTop:'5px', fontFamily:'monospace'}}>
                                Total Messages Received: <span style={{color:'#fff'}}>{historyRef.current?.length || 0}</span> | 
                                Last Updated: <span style={{color:'#fff'}}>{dataRef.current.lastUpdated ? new Date(dataRef.current.lastUpdated).toLocaleTimeString() : 'N/A'}</span>
                            </div>
                        </div>
                        <button onClick={() => setShowDetailPanel(false)} style={{background:'none', border:'none', color:'#888', cursor:'pointer', fontSize:'24px', padding:'0 10px'}}>✕</button>
                    </div>

                    <div style={{paddingRight:'10px'}}>
                        <DetailChart label="AVERAGE DAILY TEMPERATURE" unit="°F" color="#00f7ff" 
                            dailyData={getDailyAverages(historyRef.current, 'temp')} 
                            rawHistory={historyRef.current} 
                            dataKey="temp"
                        />

                        <DetailChart label="AVERAGE DAILY HUMIDITY" unit="%" color="#00ff9d" 
                            dailyData={getDailyAverages(historyRef.current, 'humidity')} 
                            rawHistory={historyRef.current}
                            dataKey="humidity"
                        />
                        
                        <DetailChart label="AVERAGE DAILY PRESSURE" unit="hPa" color="#ffcc00" 
                            dailyData={getDailyAverages(historyRef.current, 'pressure')} 
                            rawHistory={historyRef.current}
                            dataKey="pressure"
                        />
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default APSViewer;