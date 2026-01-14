import React, { useState, useEffect, useCallback } from 'react';
import APSViewer from './components/APSViewer';
import PowerBIReport from './PowerBIReport';
import './Dashboard.css';

// --- CONFIGURATION ---
const TOKEN_API_URL = "https://iot-telemetry-fxaua0f8ehfvh0ae.eastus-01.azurewebsites.net/api/aps-token";
const TELEMETRY_API_URL = "https://iot-telemetry-fxaua0f8ehfvh0ae.eastus-01.azurewebsites.net/api/iot-telemetry";

const DEVICE_NAME = "MXCHIP-NELSON"; 
const MODEL_URN = "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6MjAyMzAxMjkvSG91c2UucnZ0";  
// ---------------------

const Dashboard = () => {
    // --- STATE ---
    const [apsToken, setApsToken] = useState(null); 
    const [current, setCurrent] = useState({});
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- 1. FETCH VIEWER TOKEN (ON LOAD) ---
    useEffect(() => {
        const fetchToken = async () => {
            try {
                const resp = await fetch(TOKEN_API_URL);
                if (!resp.ok) throw new Error("Failed to fetch secure viewer token");
                
                const data = await resp.json();
                setApsToken(data.access_token);
                console.log("Secure Token Acquired");
            } catch (err) {
                console.error("Token Error:", err);
            }
        };
        fetchToken();
    }, []);

    // --- 2. FETCH TELEMETRY DATA (RECURRING) ---
    const fetchData = useCallback(async () => {
        try {
            const response = await fetch(TELEMETRY_API_URL);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const json = await response.json();
            
            if (json.current) setCurrent(json.current);
            if (json.history) setHistory(json.history);
            setError(null);
        } catch (err) {
            console.error(err);
            setError("Connection Error. Retrying...");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); 
        return () => clearInterval(interval);
    }, [fetchData]);

    // --- HELPERS ---
    const isStale = () => {
        if (!current.lastUpdated) return true;
        const now = new Date().getTime();
        const last = new Date(current.lastUpdated).getTime();
        return (now - last) > 300000; // 5 minutes
    };

    const statusClass = isStale() ? 'status-offline' : 'status-online';
    const statusText = isStale() ? "OFFLINE / SIGNAL LOST" : "ONLINE / ACTIVE";
    const recentHistory = history.slice(0, 10);

    return (
        <div className="dashboard-container" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100vh', 
            maxHeight: '100vh', 
            overflowY: 'auto', 
            padding: '20px',
            boxSizing: 'border-box'
        }}>
            
            <header style={{ flex: '0 0 auto', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0 }}>SENSOR DASHBOARD</h1>
                {loading && <div style={{color: '#aaa'}}>Loading Data...</div>}
                {error && <div className="error-msg">⚠️ {error}</div>}
            </header>

            <div className="dashboard-split-view" style={{ display: 'flex', flex: '0 0 600px', gap: '20px', marginBottom: '40px' }}>
                
                {/* LEFT: 3D VIEWER */}
                <div className="viewer-pane" style={{ 
                    flex: 2, 
                    background: '#000', 
                    borderRadius: '12px', 
                    border: '1px solid #333', 
                    position: 'relative',
                    overflow: 'hidden' 
                }}>
                    {apsToken ? (
                        <APSViewer 
                            token={apsToken} 
                            urn={MODEL_URN} 
                            sensorData={current}  
                        />
                    ) : (
                        <div style={{
                            display: 'flex', 
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            height: '100%', 
                            color: '#00f7ff', 
                            fontFamily: 'monospace'
                        }}>
                            AUTHENTICATING SECURE VIEWER...
                        </div>
                    )}
                </div>

                {/* RIGHT: DATA PANEL */}
                <div className="data-pane" style={{ 
                    flex: 1, 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    overflowY: 'auto' 
                }}>
                    <div className="data-card">
                        <div className="device-name">{DEVICE_NAME}</div>
                        <div className={`status-indicator ${statusClass}`}>
                            <span className={`status-dot ${statusClass}`}></span>
                            {statusText}
                        </div>

                        <div className="data-row">
                            <span className="data-icon">🌡️</span>
                            <span className="data-label">TEMPERATURE</span>
                            <span className="data-value">{current.temp ? Number(current.temp).toFixed(1) : '--'} °F</span>
                        </div>
                        <div className="data-row">
                            <span className="data-icon">💧</span>
                            <span className="data-label">HUMIDITY</span>
                            <span className="data-value">{current.humidity ? Number(current.humidity).toFixed(1) : '--'} %</span>
                        </div>
                        <div className="data-row">
                            <span className="data-icon">⏲️</span>
                            <span className="data-label">PRESSURE</span>
                            <span className="data-value">{current.pressure ? Number(current.pressure).toFixed(0) : '--'} hPa</span>
                        </div>
                        
                        <div className="last-updated">
                            LAST SYNC: {current.lastUpdated ? new Date(current.lastUpdated).toLocaleTimeString() : 'N/A'}
                        </div>
                    </div>

                    <div className="history-section" style={{marginTop: 0}}>
                        <h2 style={{fontSize: '1rem', marginBottom: '10px'}}>LOGS (LAST 10)</h2>
                        <div className="table-container" style={{minHeight: 'auto'}}>
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Temp</th>
                                        <th>Hum</th>
                                        <th>hPa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentHistory.map((row, i) => (
                                        <tr key={i}>
                                            <td style={{ fontSize: '0.8rem' }}>{new Date(row.lastUpdated).toLocaleTimeString()}</td>
                                            <td className="col-cyan">{Number(row.temp).toFixed(1)}</td>
                                            <td className="col-cyan">{Number(row.humidity).toFixed(1)}</td>
                                            <td>{Number(row.pressure).toFixed(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ flex: '0 0 auto', paddingBottom: '40px' }}>
                <PowerBIReport />
            </div>

        </div>
    );
};

export default Dashboard;