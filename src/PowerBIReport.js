import React from 'react';
import './Dashboard.css'; // Re-use the dashboard CSS

const PowerBIReport = () => {
    return (
        <div className="powerbi-container">
            <h2 className="section-title">HISTORICAL ANALYSIS</h2>
            <div className="iframe-wrapper">
                <iframe 
                    title="MXChip Power BI" 
                    width="100%" 
                    height="600" 
                    src="https://app.powerbi.com/reportEmbed?reportId=9ca81055-f06b-4078-9dfd-d0b0c2b6d1cc&autoAuth=true&ctid=630a74b4-af9a-45e6-b957-c44d9ba9e5d8" 
                    frameBorder="0" 
                    allowFullScreen={true}>
                </iframe>
            </div>
        </div>
    );
};

export default PowerBIReport;