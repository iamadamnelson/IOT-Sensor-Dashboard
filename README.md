# IoT Digital Twin Dashboard & Weather Enrichment Pipeline

A full-stack IoT solution that creates a "Digital Twin" of a home environment. This project ingests real-time telemetry from an MXChip sensor, enriches it with live external weather data via Azure Functions, and visualizes the correlation in a 3D Viewer using Autodesk Platform Services (APS).

![Project Screenshot](https://www.iamadamnelson.com/images/project-2.JPG) 

## Features

* **Real-Time Monitoring:** Live streaming of Temperature, Humidity, and Pressure from an MXChip AZ3166.
* **Data Enrichment:** Custom Azure Function (`iot-recorder`) intercepts sensor messages and injects real-time local weather data (OpenWeatherMap API) before storage.
* **3D Digital Twin:** Interactive 3D model integration using Autodesk Platform Services (formerly Forge) to visualize sensor placement and status.
* **Historical Analysis:** Custom-built SVG charting with Min/Max indicators and dynamic scaling.
* **Cloud Native:** Fully serverless architecture using Azure IoT Hub, Azure Functions (Node.js v4), and Cosmos DB.

## Architecture

**Hardware** (MXChip) ➡ **Azure IoT Hub** ➡ **Azure Function** (Enrichment) ➡ **Cosmos DB** ➡ **React App**

1.  **Ingestion:** The MXChip sensor sends telemetry to **Azure IoT Hub**.
2.  **Enrichment:** The `iot-recorder` function triggers on new messages, fetches local weather data (OpenWeatherMap) for the precise coordinates, and merges it with the sensor payload.
3.  **Storage:** The combined "Enriched" JSON is saved to **Azure Cosmos DB**.
4.  **Visualization:** The React frontend queries the data via the `iot-telemetry` API and overlays it onto a 3D model using the APS Viewer.

## Tech Stack

* **Hardware:** MXChip IoT DevKit (AZ3166)
* **Cloud Infrastructure:** Microsoft Azure (IoT Hub, Cosmos DB, Azure Functions)
* **Backend:** Node.js (Azure Functions v4)
* **Frontend:** React.js, Three.js (via Autodesk Viewer)
* **External APIs:** OpenWeatherMap, Autodesk Platform Services (APS)